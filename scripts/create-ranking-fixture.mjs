// Local browser-smoke fixture; never contains real user data.
import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('output/playwright');
await mkdir(directory, { recursive: true });
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('导入验收');
sheet.addRows([
  ['作品名称', '评分', 'extra 评价'],
  ['时空轮回', 8.25, 'Excel 导入的已收录作品评价'],
  ['Gtool 本地验收未收录作品 1002', 7.5, '搜索失败后明确保留原名称'],
]);
const path = resolve(directory, 'ranking-import-smoke.xlsx');
await workbook.xlsx.writeFile(path);
console.log(path);
