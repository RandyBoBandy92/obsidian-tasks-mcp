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

  // Helper function to find task by description content
  function findTaskByDescription(content: string, description: string): { lineNumber: number; line: string } | null {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(description) && lines[i].trim().startsWith('- [')) {
        return { lineNumber: i + 1, line: lines[i] }; // Convert to 1-based line numbers
      }
    }
    return null;
  }

  // Second bundle: Monthly recurring patterns (5 tests)
  describe('Monthly Recurring Patterns Bundle 2', () => {
    it('should handle monthly task pattern', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Monthly task 🔁 every month');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence one month later (Sept 5)
      expect(updatedContent).toMatch(/Monthly task.*\[x\].*✅/);
      expect(updatedContent).toMatch(/Monthly task.*\[ \].*2025-09-05/);
    });

    it('should handle every 2 months pattern', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Every 2 months 🔁 every 2 months');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence two months later (Oct 5)
      expect(updatedContent).toMatch(/Every 2 months.*\[x\].*✅/);
      expect(updatedContent).toMatch(/Every 2 months.*\[ \].*2025-10-05/);
    });

    it('should handle first of month pattern', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'First of month 🔁 every month on the 1st');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence on first of next month (Sept 1)
      expect(updatedContent).toMatch(/First of month.*\[x\].*✅/);
      expect(updatedContent).toMatch(/First of month.*\[ \].*2025-09-01/);
    });

    it('should handle last Friday monthly pattern', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Last Friday monthly 🔁 every month on the last Friday');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence on last Friday of next month (Sept 26)
      expect(updatedContent).toMatch(/Last Friday monthly.*\[x\].*✅/);
      expect(updatedContent).toMatch(/Last Friday monthly.*\[ \].*2025-09-26/);
    });

    it('should handle 2nd last Friday pattern', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, '2nd last Friday 🔁 every month on the 2nd last Friday');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence on 2nd last Friday of next month (Sept 19)
      expect(updatedContent).toMatch(/2nd last Friday.*\[x\].*✅/);
      expect(updatedContent).toMatch(/2nd last Friday.*\[ \].*2025-09-19/);
    });
  });

  // Third bundle: Yearly and complex patterns (5 tests)
  describe('Yearly and Complex Patterns Bundle 3', () => {
    it('should handle yearly task pattern', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Yearly task 🔁 every year');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence one year later (2026-08-05)
      expect(updatedContent).toMatch(/Yearly task.*\[x\].*✅/);
      expect(updatedContent).toMatch(/Yearly task.*\[ \].*2026-08-05/);
    });

    it('should handle January 15th yearly pattern', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'January 15th 🔁 every January on the 15th');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence on Jan 15th next year (2026-01-15)
      expect(updatedContent).toMatch(/January 15th.*\[x\].*✅/);
      expect(updatedContent).toMatch(/January 15th.*\[ \].*2026-01-15/);
    });

    it('should handle February last day yearly pattern', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'February last day 🔁 every February on the last');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence on last day of February next year (2026-02-28)
      expect(updatedContent).toMatch(/February last day.*\[x\].*✅/);
      expect(updatedContent).toMatch(/February last day.*\[ \].*2026-02-28/);
    });

    it('should handle complex multi-date task (Mow the lawn)', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Mow the lawn 🔁 every 2 weeks');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence with all dates moved forward by 2 weeks
      expect(updatedContent).toMatch(/Mow the lawn.*\[x\].*✅/);
      expect(updatedContent).toMatch(/Mow the lawn.*\[ \].*⏳ 2025-08-28.*📅 2025-08-30/);
    });

    it('should handle complex multi-date task (Sweep floors)', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Sweep floors 🔁 every week');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence with all dates moved forward by 1 week
      expect(updatedContent).toMatch(/Sweep floors.*\[x\].*✅/);
      expect(updatedContent).toMatch(/Sweep floors.*\[ \].*⏳ 2025-08-20.*📅 2025-08-22/);
    });
  });

  // Fourth bundle: Priority/Tags/Indented/Edge Cases (5 tests)
  describe('Priority Tags Indented Edge Cases Bundle 4', () => {
    it('should handle high priority recurring task with tags', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'High priority recurring #work #urgent');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should create next occurrence with priority and tags preserved
      expect(updatedContent).toMatch(/High priority recurring.*\[x\].*✅/);
      expect(updatedContent).toMatch(/High priority recurring.*\[ \].*#work #urgent.*⏫.*2025-08-12/);
    });

    it('should handle indented daily recurring task', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Indented daily 🔁 every day');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should preserve indentation and create next occurrence
      expect(updatedContent).toMatch(/  - \[x\] Indented daily.*✅/);
      expect(updatedContent).toMatch(/  - \[ \] Indented daily.*2025-08-06/);
    });

    it('should handle double indented weekly recurring task', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Double indented 🔁 every week');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should preserve double indentation and create next occurrence
      expect(updatedContent).toMatch(/    - \[x\] Double indented.*✅/);
      expect(updatedContent).toMatch(/    - \[ \] Double indented.*2025-08-12/);
    });

    it('should handle edge case Feb 29 yearly recurrence', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Edge case Feb 29 🔁 every year');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should handle leap year edge case - move to Feb 28 in non-leap year 2025
      expect(updatedContent).toMatch(/Edge case Feb 29.*\[x\].*✅/);
      expect(updatedContent).toMatch(/Edge case Feb 29.*\[ \].*2025-02-28/);
    });

    it('should handle edge case Jan 31 monthly recurrence', async () => {
      const initialContent = readFileSync(testFilePath, 'utf-8');
      const taskInfo = findTaskByDescription(initialContent, 'Edge case Jan 31 monthly 🔁 every month');
      expect(taskInfo).not.toBeNull();
      
      const result = await completeTask(`${testFilePath}:${taskInfo!.lineNumber}`);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task completed successfully');
      expect(result.message).toContain('Created next recurring task');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      
      // Should handle month-end edge case - move to Feb 28 (last day of February)
      expect(updatedContent).toMatch(/Edge case Jan 31 monthly.*\[x\].*✅/);
      expect(updatedContent).toMatch(/Edge case Jan 31 monthly.*\[ \].*2025-02-28/);
    });
  });
});