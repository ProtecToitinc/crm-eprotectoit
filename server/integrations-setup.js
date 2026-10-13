'use strict';
/**
 * Dans server.js, APRÈS avoir déclaré `auth` et AVANT app.use('/api', 404):
 *   const integrations = require('./integrations-setup');
 *   integrations.register(app, { auth });
 * Après app.listen(...):
 *   integrations.startJobs();
 */
const leads = require('./leads');
const drive = require('./drive');
const { getSetting } = require('./lib');
let started=false;
function register(app,{auth}) {
  if(typeof auth!=='function') throw new Error('Middleware auth requis');
  leads.register(app,{auth});
  drive.register(app,{auth});
}
function startJobs() {
  if(started||process.env.DISABLE_JOBS==='1') return;
  started=true;
  const driveJob=async()=>{
    try {if((await getSetting('drive_sync_enabled'))==='1') await drive.sync({dry:false});}
    catch(e){console.error('[drive] tâche en erreur :',e.message);}
  };
  const metaJob=async()=>{try{await leads.pollMeta();}catch(e){console.error('[meta] tâche en erreur :',e.message);}};
  const emailJob=async()=>{try{await leads.retryNotifications();}catch(e){console.error('[mail] tâche en erreur :',e.message);}};
  const schedule=(fn,interval)=>{const timer=setInterval(fn,interval);timer.unref?.();};
  // Delay first run until the app has started; never force a first live Drive sync.
  schedule(driveJob,5*60*1000);
  schedule(metaJob,3*60*1000);
  schedule(emailJob,10*60*1000);
}
module.exports={register,startJobs};