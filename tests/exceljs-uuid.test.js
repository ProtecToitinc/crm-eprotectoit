'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('../server/node_modules/exceljs');

test('ExcelJS reads and writes XLSX after patched uuid override', async () => {
  const wb = new ExcelJS.Workbook();
  const sh = wb.addWorksheet('Soumission');
  sh.getCell('A1').value = 'ProtecToit';
  sh.getCell('B2').value = 1234.56;
  const data = await wb.xlsx.writeBuffer();
  const next = new ExcelJS.Workbook();
  await next.xlsx.load(data);
  assert.equal(next.getWorksheet('Soumission').getCell('A1').value, 'ProtecToit');
  assert.equal(next.getWorksheet('Soumission').getCell('B2').value, 1234.56);
});
