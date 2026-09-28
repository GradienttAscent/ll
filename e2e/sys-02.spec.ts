import { expect, test } from '@playwright/test';

test('SYS-02 scheduled block lifecycle: start, pause, resume, complete, feedback, dashboard, and history', async ({ page }, testInfo) => {
  const uniqueEmail = `sys02-${Date.now()}-${testInfo.parallelIndex}@example.com`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('SYS-02 Student');
  await page.getByLabel('Email').fill(uniqueEmail);
  await page.getByLabel('Password', { exact: true }).fill('secret123');
  await page.getByLabel('Confirm password').fill('secret123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Timeline & Journal' })).toBeVisible();

  await page.getByRole('button', { name: 'Past Papers & Topics' }).click();
  await page.getByRole('button', { name: 'Course Syllabus' }).click();
  await page.getByLabel('Document Name / Code').fill('SYS-02 Syllabus');
  await page.getByLabel('Or Paste Document Text').fill('Unit 1: Graph Algorithms (100%).');
  await page.getByRole('button', { name: 'Extract Topics & Questions' }).click();
  await expect(page.getByText('Academic document saved')).toBeVisible();

  await page.getByRole('button', { name: 'Planner & Calendar' }).click();
  await page.getByRole('button', { name: 'Generate & Save Schedule' }).click();
  await expect(page.getByText(/Schedule generated and saved:/)).toBeVisible();

  const startStudyButton = page.getByRole('button', { name: 'Start Study' }).first();
  await expect(startStudyButton).toBeVisible();
  await startStudyButton.click();

  await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).first().click();
  await expect(page.getByText('Session paused.')).toBeVisible();

  await page.getByRole('button', { name: 'Resume' }).first().click();
  await expect(page.getByText('Session resumed.')).toBeVisible();

  await page.getByRole('button', { name: 'Complete Block' }).click();
  await expect(page.getByText('How did that session go?')).toBeVisible();

  await page.getByRole('button', { name: '4' }).nth(0).click();
  await page.getByRole('button', { name: '4' }).nth(1).click();
  await page.getByRole('button', { name: '4' }).nth(2).click();
  await page.getByLabel('Notes').fill('Solid improvement plan with a clear milestone.');
  await page.getByRole('button', { name: 'Save Feedback' }).click();
  await expect(page.getByText('How did that session go?')).toBeHidden({ timeout: 10000 });

  await page.getByRole('button', { name: 'Timeline & Journal' }).click();
  await expect(page.getByText('Completed Sessions')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Session feedback' })).toBeVisible();
  await expect(page.getByText('Average Focus')).toBeVisible();
  await expect(page.getByText('Average Progress · 1 response')).toBeVisible();

  await page.getByRole('button', { name: 'Session History' }).click();
  await expect(page.getByText('Executed Sessions & Feedback')).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/SYS-02.png', fullPage: true });
  await expect(page.getByText('Session Reflection Log')).toBeVisible();
  await expect(page.getByText('Solid improvement plan with a clear milestone.')).toBeVisible();
});
