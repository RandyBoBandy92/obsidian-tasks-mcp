import fs from 'fs/promises';
import path from 'path';

// Import the functions to test
import { findAllTasks, queryTasks } from '../src/index.js';

describe('Task Querying', () => {
  const testVaultPath = path.join(process.cwd(), 'tests', 'test-vault');
  
  // Disable the server auto-start for tests
  process.env.DISABLE_SERVER = 'true';
  
  beforeAll(async () => {
    // Verify that the test vault exists
    try {
      await fs.access(testVaultPath);
    } catch (error) {
      throw new Error(`Test vault not accessible: ${error}`);
    }
  });
  
  test('findAllTasks should collect all tasks from the test vault', async () => {
    const tasks = await findAllTasks(testVaultPath);
    expect(tasks.length).toBeGreaterThan(0);
  });
  
  test('queryTasks with done filter should return only completed tasks', async () => {
    const allTasks = await findAllTasks(testVaultPath);
    const query = 'done';
    const filteredTasks = queryTasks(allTasks, query);
    
    expect(filteredTasks.length).toBeGreaterThan(0);
    expect(filteredTasks.every(task => task.status === 'complete')).toBe(true);
  });
  
  test('queryTasks with not done filter should return only incomplete tasks', async () => {
    const allTasks = await findAllTasks(testVaultPath);
    const query = 'not done';
    const filteredTasks = queryTasks(allTasks, query);
    
    expect(filteredTasks.length).toBeGreaterThan(0);
    expect(filteredTasks.every(task => task.status === 'incomplete')).toBe(true);
  });
  
  test('queryTasks with tag filters should work correctly', async () => {
    const allTasks = await findAllTasks(testVaultPath);
    
    // Tasks with tags
    const tasksWithTags = queryTasks(allTasks, 'has tags');
    expect(tasksWithTags.length).toBeGreaterThan(0);
    expect(tasksWithTags.every(task => task.tags && task.tags.length > 0)).toBe(true);
    
    // Tasks without tags
    const tasksWithoutTags = queryTasks(allTasks, 'no tags');
    expect(tasksWithoutTags.every(task => task.tags.length === 0)).toBe(true);
  });
  
  test('queryTasks with due date filters should work correctly', async () => {
    const allTasks = await findAllTasks(testVaultPath);
    
    // Tasks with due dates
    const tasksWithDueDate = queryTasks(allTasks, 'has due date');
    expect(tasksWithDueDate.length).toBeGreaterThan(0);
    expect(tasksWithDueDate.every(task => task.dueDate !== undefined)).toBe(true);
    
    // Tasks without due dates
    const tasksWithoutDueDate = queryTasks(allTasks, 'no due date');
    expect(tasksWithoutDueDate.every(task => task.dueDate === undefined)).toBe(true);
  });
  
  test('queryTasks with priority filters should work correctly', async () => {
    const allTasks = await findAllTasks(testVaultPath);
    
    // High priority tasks
    const highPriorityTasks = queryTasks(allTasks, 'priority is high');
    expect(highPriorityTasks.length).toBeGreaterThan(0);
    expect(highPriorityTasks.every(task => task.priority === 'high')).toBe(true);
  });
  
  test('queryTasks with multiple filters should use AND logic', async () => {
    const allTasks = await findAllTasks(testVaultPath);
    
    // High priority incomplete tasks
    const query = `not done
priority is high`;
    
    const filteredTasks = queryTasks(allTasks, query);
    
    expect(filteredTasks.length).toBeGreaterThan(0);
    expect(filteredTasks.every(task => 
      task.status === 'incomplete' && task.priority === 'high'
    )).toBe(true);
  });
  
  test('queryTasks with description filters should work correctly', async () => {
    const allTasks = await findAllTasks(testVaultPath);

    // Tasks with specific text in description
    const tasksWithText = queryTasks(allTasks, 'description includes priority');
    expect(tasksWithText.length).toBeGreaterThan(0);
    expect(tasksWithText.every(task =>
      task.description.toLowerCase().includes('priority')
    )).toBe(true);

    // Tasks without specific text
    const tasksWithoutText = queryTasks(allTasks, 'description does not include priority');
    expect(tasksWithoutText.every(task =>
      !task.description.toLowerCase().includes('priority')
    )).toBe(true);
  });

  test('queryTasks with scheduled date filters should work correctly', async () => {
    const allTasks = await findAllTasks(testVaultPath);

    // Tasks with scheduled dates
    const tasksWithScheduled = queryTasks(allTasks, 'has scheduled date');
    expect(tasksWithScheduled.length).toBeGreaterThan(0);
    expect(tasksWithScheduled.every(task => task.scheduledDate !== undefined)).toBe(true);

    // Tasks without scheduled dates
    const tasksWithoutScheduled = queryTasks(allTasks, 'no scheduled date');
    expect(tasksWithoutScheduled.every(task => task.scheduledDate === undefined)).toBe(true);
  });

  test('queryTasks with scheduled date comparison filters should work correctly', async () => {
    const allTasks = await findAllTasks(testVaultPath);

    // Scheduled before specific date
    const scheduledBefore = queryTasks(allTasks, 'scheduled before 2024-12-31');
    expect(scheduledBefore.every(task =>
      task.scheduledDate !== undefined && task.scheduledDate < '2024-12-31'
    )).toBe(true);

    // Scheduled after specific date
    const scheduledAfter = queryTasks(allTasks, 'scheduled after 2024-01-01');
    expect(scheduledAfter.every(task =>
      task.scheduledDate !== undefined && task.scheduledDate > '2024-01-01'
    )).toBe(true);
  });

  test('queryTasks with start date filters should work correctly', async () => {
    const allTasks = await findAllTasks(testVaultPath);

    // Tasks with start dates
    const tasksWithStart = queryTasks(allTasks, 'has start date');
    expect(tasksWithStart.length).toBeGreaterThan(0);
    expect(tasksWithStart.every(task => task.startDate !== undefined)).toBe(true);

    // Tasks without start dates
    const tasksWithoutStart = queryTasks(allTasks, 'no start date');
    expect(tasksWithoutStart.every(task => task.startDate === undefined)).toBe(true);
  });

  test('queryTasks with start date comparison filters should work correctly', async () => {
    const allTasks = await findAllTasks(testVaultPath);

    // Starts before specific date
    const startsBefore = queryTasks(allTasks, 'starts before 2024-12-31');
    expect(startsBefore.every(task =>
      task.startDate !== undefined && task.startDate < '2024-12-31'
    )).toBe(true);

    // Starts after specific date
    const startsAfter = queryTasks(allTasks, 'starts after 2024-01-01');
    expect(startsAfter.every(task =>
      task.startDate !== undefined && task.startDate > '2024-01-01'
    )).toBe(true);
  });
});