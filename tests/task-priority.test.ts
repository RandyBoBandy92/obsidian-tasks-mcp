import { queryTasks } from '../src/index.js';
import { applyFilter, parseTaskLine, Task } from '../src/TaskParser.js';

describe('Task Priority Filtering', () => {
  // Disable the server auto-start for tests
  process.env.DISABLE_SERVER = 'true';

  // Sample tasks with various priority levels for testing
  const testTasks = [
    `- [ ] Task with no priority`,
    `- [ ] Task with highest priority ⏫⏫`,
    `- [ ] Task with high priority ⏫`,
    `- [ ] Task with medium priority 🔼`,
    `- [ ] Task with low priority 🔽`,
    `- [ ] Task with lowest priority ⏬`,
    `- [x] Completed high priority task ⏫`,
    `- [ ] Task with multiple priority markers ⏫⏫ 🔼 (only highest should count)`,
  ];

  // Parse the test tasks
  const tasks = testTasks.map((line, index) => 
    parseTaskLine(line, `/test/priority-file.md`, index)
  ).filter(task => task !== null) as Task[];

  test('tasks should be parsed with correct priorities', () => {
    // Verify that all tasks were parsed
    expect(tasks.length).toBe(8);
    
    // Check that priorities were assigned correctly
    expect(tasks[0].priority).toBeUndefined();
    expect(tasks[1].priority).toBe('highest');
    expect(tasks[2].priority).toBe('high');
    expect(tasks[3].priority).toBe('medium');
    expect(tasks[4].priority).toBe('low');
    expect(tasks[5].priority).toBe('lowest');
    expect(tasks[6].priority).toBe('high');
    
    // When multiple priorities are present, the highest/first should be used
    expect(tasks[7].priority).toBe('highest');
  });

  test('applyFilter should filter tasks by priority', () => {
    // Filter by each priority level
    const highestPriorityTasks = tasks.filter(task => applyFilter(task, 'priority is highest'));
    expect(highestPriorityTasks.length).toBe(2); // Task explicitly marked highest and the one with multiple markers
    
    const highPriorityTasks = tasks.filter(task => applyFilter(task, 'priority is high'));
    expect(highPriorityTasks.length).toBe(2); // Regular high priority task and completed one
    
    const mediumPriorityTasks = tasks.filter(task => applyFilter(task, 'priority is medium'));
    expect(mediumPriorityTasks.length).toBe(1);
    
    const lowPriorityTasks = tasks.filter(task => applyFilter(task, 'priority is low'));
    expect(lowPriorityTasks.length).toBe(1);
    
    const lowestPriorityTasks = tasks.filter(task => applyFilter(task, 'priority is lowest'));
    expect(lowestPriorityTasks.length).toBe(1);
    
    const noPriorityTasks = tasks.filter(task => applyFilter(task, 'priority is none'));
    expect(noPriorityTasks.length).toBe(1);
  });

  test('queryTasks should combine priority filters with status filters', () => {
    // Combine priority and status filters
    const query = `priority is high
done`;
    
    const highPriorityCompletedTasks = queryTasks(tasks, query);
    expect(highPriorityCompletedTasks.length).toBe(1);
    expect(highPriorityCompletedTasks[0].status).toBe('complete');
    expect(highPriorityCompletedTasks[0].priority).toBe('high');
  });

  test('queryTasks should support negative priority filtering', () => {
    // Negative priority filtering
    const query = `not priority is high`;
    
    const notHighPriorityTasks = queryTasks(tasks, query);
    const expectedCount = tasks.length - tasks.filter(t => t.priority === 'high').length;
    expect(notHighPriorityTasks.length).toBe(expectedCount); 
    expect(notHighPriorityTasks.every(task => task.priority !== 'high')).toBe(true);
  });

  test('queryTasks should support OR conditions with priorities', () => {
    // OR conditions with priorities
    const query = `priority is highest OR priority is lowest`;
    
    const extremePriorityTasks = queryTasks(tasks, query);
    expect(extremePriorityTasks.length).toBe(3); // 2 highest + 1 lowest
    expect(extremePriorityTasks.every(task => 
      task.priority === 'highest' || task.priority === 'lowest'
    )).toBe(true);
  });

  test('applyFilter should handle complex combinations with priorities', () => {
    // Complex filtering with simpler syntax that our parser can handle
    const query = `not done
priority is highest OR priority is high`;
    
    const complexFilterResults = queryTasks(tasks, query);
    
    expect(complexFilterResults.length).toBe(3); // 2 highest tasks + 1 high, all incomplete
    expect(complexFilterResults.every(task => 
      (task.priority === 'highest' || task.priority === 'high') && 
      task.status === 'incomplete'
    )).toBe(true);
  });
});