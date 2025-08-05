import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync, writeFileSync } from 'fs';
import { completeTask } from '../src/TaskParser.js';

describe('Task Recurrence', () => {
  const testFilePath = '/Users/randy/Documents/dev/obsidian-tasks-mcp/tests/test-completion.md';
  let originalContent: string;

  beforeEach(() => {
    // Store the original state of the test file
    originalContent = readFileSync(testFilePath, 'utf-8');
  });

  afterEach(() => {
    // Restore the original state after each test
    writeFileSync(testFilePath, originalContent, 'utf-8');
  });

  it('should create a new recurring task below completed task with "when done" modifier', async () => {
    // Complete the "Daily task when done" task (line 11)
    const result = await completeTask(`${testFilePath}:11`);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Task completed successfully');
    expect(result.message).toContain('Created next recurring task');

    // Read the updated file content
    const updatedContent = readFileSync(testFilePath, 'utf-8');
    const lines = updatedContent.split('\n');

    // Check that the original task is now completed
    expect(lines[10]).toMatch(/^\- \[x\] Daily task when done.*✅ \d{4}-\d{2}-\d{2}$/);

    // Check that a new recurring task was created below it (line 12)
    expect(lines[11]).toMatch(/^\- \[ \] Daily task when done 🔁 every day when done 📅 \d{4}-\d{2}-\d{2}$/);
    
    // Verify the new task has tomorrow's date (since it's "when done")
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    expect(lines[11]).toContain(tomorrowStr);
  });

  it('should create a new recurring task with original date-based recurrence', async () => {
    // Complete the "Weekly task" (line 16)
    const result = await completeTask(`${testFilePath}:16`);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Task completed successfully');
    expect(result.message).toContain('Created next recurring task');

    // Read the updated file content
    const updatedContent = readFileSync(testFilePath, 'utf-8');
    const lines = updatedContent.split('\n');

    // Check that the original task is now completed
    expect(lines[15]).toMatch(/^\- \[x\] Weekly task.*✅ \d{4}-\d{2}-\d{2}$/);

    // Check that a new recurring task was created below it (next week)
    expect(lines[16]).toMatch(/^\- \[ \] Weekly task 🔁 every week 📅 2025-08-12$/);
  });

  it('should handle recurring task with multiple dates', async () => {
    // Complete the "Complex multi-date" task (line 43)
    const result = await completeTask(`${testFilePath}:43`);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Task completed successfully');
    expect(result.message).toContain('Created next recurring task');

    // Read the updated file content
    const updatedContent = readFileSync(testFilePath, 'utf-8');
    const lines = updatedContent.split('\n');

    // Check that the original task is now completed
    expect(lines[42]).toMatch(/^\- \[x\] Complex multi-date.*✅ \d{4}-\d{2}-\d{2}$/);

    // Check that a new recurring task was created with all dates moved forward by 1 week
    expect(lines[43]).toContain('🛫 2025-08-10'); // Start date +7 days
    expect(lines[43]).toContain('⏳ 2025-08-11'); // Scheduled date +7 days  
    expect(lines[43]).toContain('📅 2025-08-12'); // Due date +7 days
  });

  it('should preserve indentation and formatting', async () => {
    // Set up initial content with indented recurring task
    const initialContent = `# Test Tasks for Completion

## Tasks for Testing
  - [ ] Indented recurring task 🔁 every day 📅 2025-08-05
`;
    writeFileSync(testFilePath, initialContent, 'utf-8');

    // Complete the recurring task (line 4)
    const result = await completeTask(`${testFilePath}:4`);

    expect(result.success).toBe(true);

    // Read the updated file content
    const updatedContent = readFileSync(testFilePath, 'utf-8');
    const lines = updatedContent.split('\n');

    // Check that the new task preserves the same indentation
    expect(lines[4]).toMatch(/^  \- \[ \] Indented recurring task/);
  });

  it('should handle non-recurring tasks normally', async () => {
    // Set up initial content with a non-recurring task
    const initialContent = `# Test Tasks for Completion

## Tasks for Testing
- [ ] Regular task #test 📅 2025-08-05
- [x] Already completed task ✅ 2025-08-01
`;
    writeFileSync(testFilePath, initialContent, 'utf-8');

    // Complete the regular task (line 4)
    const result = await completeTask(`${testFilePath}:4`);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Task completed successfully');
    expect(result.message).not.toContain('Created next recurring task');

    // Read the updated file content
    const updatedContent = readFileSync(testFilePath, 'utf-8');
    const lines = updatedContent.split('\n');

    // Check that only the original task was marked complete, no new task created
    expect(lines[3]).toMatch(/^\- \[x\] Regular task.*✅ \d{4}-\d{2}-\d{2}$/);
    expect(lines[4]).toBe('- [x] Already completed task ✅ 2025-08-01');
    expect(lines.length).toBe(6); // Should not have additional lines
  });

  it('should handle recurring tasks with priority and tags', async () => {
    // Set up initial content with a recurring task having priority and tags
    const initialContent = `# Test Tasks for Completion

## Tasks for Testing
- [ ] Important recurring task 🔁 every week 📅 2025-08-05 ⏫ #work #urgent
`;
    writeFileSync(testFilePath, initialContent, 'utf-8');

    // Complete the recurring task (line 4)
    const result = await completeTask(`${testFilePath}:4`);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Created next recurring task');

    // Read the updated file content
    const updatedContent = readFileSync(testFilePath, 'utf-8');
    const lines = updatedContent.split('\n');

    // Check that the new task preserves priority and tags
    expect(lines[4]).toContain('⏫'); // High priority
    expect(lines[4]).toContain('#work #urgent'); // Tags
    expect(lines[4]).toContain('📅 2025-08-12'); // Next week's date
  });
});