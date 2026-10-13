'use strict';
// Private, off-volume backup mirror to a Railway S3-compatible bucket.
// Never logs access keys or object bodies.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

function configured() {
  return ['BACKUP_S3_ENDPOINT','BACKUP_S3_BUCKET','BACKUP_S3_REGION','BACKUP_S3_ACCESS_KEY_ID','BACKUP_S3_SECRET_ACCESS_KEY']
    .every(key => Boolean(process.env[key]));
}
function client() {
  return new S3Client({
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    region: process.env.BACKUP_S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY
    },
    maxAttempts: 3
  });
}
function* files(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full, rel);
    else if (entry.isFile()) yield { rel, full };
  }
}
async function mirror(dir, backupName) {
  if (!configured()) return { ok: false, configured: false, message: 'Stockage S3 non configuré' };
  const s3 = client(), bucket = process.env.BACKUP_S3_BUCKET;
  let filesUploaded = 0, bytes = 0;
  const manifests = [];
  // Store every backup under one immutable-named directory prefix.
  // SQLite snapshot and attachments are uploaded before a verified manifest.
  for (const { rel, full } of files(dir)) {
    if (rel === 'remote-manifest.json') continue;
    const key = 'crm-eprotectoit/' + backupName + '/' + rel;
    const stat = fs.statSync(full);
    const sum = crypto.createHash('sha256');
    const data = fs.createReadStream(full);
    for await (const block of data) sum.update(block);
    const hash = sum.digest('hex');
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: fs.createReadStream(full),
      ContentLength: stat.size, ContentType: 'application/octet-stream'
    }));
    const check = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (Number(check.ContentLength) !== stat.size) throw new Error('Remote object size mismatch: ' + rel);
    manifests.push({ path: rel, size: stat.size, sha256: hash });
    filesUploaded++; bytes += stat.size;
  }
  const body = Buffer.from(JSON.stringify({ name: backupName, at: new Date().toISOString(), files: manifests }, null, 2));
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: 'crm-eprotectoit/' + backupName + '/remote-manifest.json',
    Body: body, ContentLength: body.length, ContentType: 'application/json'
  }));
  const check = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'crm-eprotectoit/' + backupName + '/remote-manifest.json' }));
  if (Number(check.ContentLength) !== body.length) throw new Error('Remote manifest verification failed');
  return { ok: true, configured: true, files: filesUploaded, bytes };
}
module.exports = { configured, mirror };
