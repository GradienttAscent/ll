import { expect, test } from '@playwright/test';

test('SYS-01 register, ingest syllabus and past paper, save schedule, and view calendar', async ({ page }, testInfo) => {
  const suffix = `${Date.now()}-${testInfo.parallelIndex}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('E2E Student');
  await page.getByLabel('Email').fill(`sys01-${suffix}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('secret123');
  await page.getByLabel('Confirm password').fill('secret123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Timeline & Journal' })).toBeVisible();

  await page.getByRole('button', { name: 'Past Papers & Topics' }).click();
  await page.getByRole('button', { name: 'Course Syllabus' }).click();
  await page.getByLabel('Document Name / Code').fill('CSE312 Syllabus');
  await page.getByLabel('Or Paste Document Text').fill('Module 1: Graph Algorithms (50%).\nModule 2: Dynamic Programming (50%).');
  await page.getByRole('button', { name: 'Extract Topics & Questions' }).click();
  await expect(page.getByText('Academic document saved')).toBeVisible();
  await expect(page.getByText(/Graph Algorithms/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Past Question Paper' }).click();
  await page.getByLabel('Document Name / Code').fill('CSE312 Past Paper');
  await page.getByLabel('Or Paste Document Text').fill('QUESTION 1 (10 Marks): Explain BFS traversal. QUESTION 2 (10 Marks): Solve 0/1 Knapsack using Dynamic Programming.');
  await page.getByRole('button', { name: 'Extract Topics & Questions' }).click();
  await expect(page.getByText('Extracted Question Bank (2)')).toBeVisible();
  const questionBank = page.getByRole('heading', { name: 'Extracted Question Bank (2)' }).locator('xpath=ancestor::div[contains(@class, "space-y-6")][1]');
  await expect(questionBank.getByText('Explain BFS traversal.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Planner & Calendar' }).click();
  await expect(page.getByText(/Graph Algorithms/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Generate & Save Schedule' }).click();
  await expect(page.getByText(/Schedule generated and saved:/)).toBeVisible();
  await page.getByRole('button', { name: 'Full Calendar' }).click();
  const savedBlock = page.getByRole('region', { name: 'Weekly time grid' }).getByRole('button', { name: /^Study: Dynamic Programming .* at 08:00, 120 minutes$/ }).first();
  await expect(savedBlock).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Full Calendar' }).click();
  await expect(savedBlock).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/SYS-01.png', fullPage: true });
});
