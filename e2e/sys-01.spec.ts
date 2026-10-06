import { expect, test } from '@playwright/test';

function pdfWithText(text: string): Buffer {
  const stream = `BT (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, 'latin1');
}

test('SYS-01 analyzes current multi-file academic material groups', async ({ page }, testInfo) => {
  const suffix = `${Date.now()}-${testInfo.parallelIndex}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('E2E Student');
  await page.getByLabel('Email').fill(`sys01-${suffix}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('secret123');
  await page.getByLabel('Confirm password').fill('secret123');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'Past Papers & Topics' }).click();
  await page.getByRole('button', { name: 'Upload Material' }).click();

  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles([
    { name: 'syllabus-a.pdf', mimeType: 'application/pdf', buffer: pdfWithText('Module 1: Graph Algorithms 50%. Module 2: Dynamic Programming 50%.') },
    { name: 'syllabus-b.pdf', mimeType: 'application/pdf', buffer: pdfWithText('Module 3: Operating Systems 20%.') },
  ]);
  await fileInputs.nth(1).setInputFiles({ name: 'lecture-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Graph Algorithms\nBreadth First Search and Dynamic Programming lecture material.') });
  await fileInputs.nth(2).setInputFiles([
    { name: 'endsem-2024.pdf', mimeType: 'application/pdf', buffer: pdfWithText('QUESTION 4(a) (8 Marks): Explain BFS traversal. QUESTION 4(b) (12 Marks): Solve 0/1 Knapsack using Dynamic Programming.') },
    { name: 'endsem-2025.pdf', mimeType: 'application/pdf', buffer: pdfWithText('QUESTION 1 (10 Marks): Explain BFS traversal.') },
  ]);

  await page.getByRole('button', { name: 'Save & Analyze' }).click();
  await expect(page.getByText(/new files analyzed/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Topic Weightage & Trend Analysis' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Topic to Source/Page Map' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Extracted Question Bank' })).toBeVisible();
  await expect(page.getByText('Explain BFS traversal.', { exact: true })).toBeVisible();
});
