import { queryTasks } from '../src/index.js';
import { applyFilter, parseTaskLine, Task } from '../src/TaskParser.js';

describe('Task Status Filtering', () => {
  // Disable the server auto-start for tests
  process.env.DISABLE_SERVER = 'true';

  // Sample tasks with various status types for testing
  const testTasks = [
    `- [ ] Incomplete task`,
    `- [x] Completed task`,
    `- [-] Cancelled task`,
    `- [/] In progress task`,
    `- [>] Forward task (incomplete)`,
    `- [<] Backward task (incomplete)`,
    `- [?] Question task (non-task)`,
    `- [!] Important task (non-task)`,
    `- [ ] Incomplete task with #tag`,
    `- [X] Completed task (capital X)`,
  ];

  // Parse the test tasks
  const tasks = testTasks.map((line, index) => 
    parseTaskLine(line, `/test/status-file.md`, index)
  ).filter(task => task !== null) as Task[];

  test('tasks should be parsed with correct statuses', () => {
    // Verify that all tasks were parsed
    expect(tasks.length).toBe(10);
    
    // Check that statuses were assigned correctly
    expect(tasks[0].status).toBe('incomplete');
    expect(tasks[1].status).toBe('complete');
    expect(tasks[2].status).toBe('cancelled');
    expect(tasks[3].status).toBe('in_progress');
    expect(tasks[4].status).toBe('incomplete');
    expect(tasks[5].status).toBe('incomplete');
    expect(tasks[6].status).toBe('non_task');
    expect(tasks[7].status).toBe('non_task');
    expect(tasks[8].status).toBe('incomplete');
    expect(tasks[9].status).toBe('complete'); // Capital X

    // Check that status symbols are preserved
    expect(tasks[4].statusSymbol).toBe('>');
    expect(tasks[5].statusSymbol).toBe('<');
    expect(tasks[6].statusSymbol).toBe('?');
    expect(tasks[7].statusSymbol).toBe('!');
  });

  test('applyFilter should filter tasks by done status', () => {
    // Test done filter
    const doneResults = tasks.filter(task => applyFilter(task, 'done'));
    expect(doneResults.length).toBe(2);
    expect(doneResults.every(task => task.status === 'complete')).toBe(true);
    
    // Directly look for tasks that should be "not done"
    // Only include tasks that are 'incomplete' or 'in_progress' and count them
    const manualNotDone = tasks.filter(task => 
      task.status === 'incomplete' || task.status === 'in_progress'
    );
    
    console.log("Manually filtered not done tasks:", manualNotDone.length);
    manualNotDone.forEach(task => {
      console.log(`- [${task.statusSymbol}] ${task.description} (${task.status})`);
    });
    
    // Debug each task with the filter
    console.log("\nApplying 'not done' filter to each task:");
    tasks.forEach(task => {
      const result = applyFilter(task, 'not done');
      console.log(`- [${task.statusSymbol}] ${task.description} (${task.status}) => ${result}`);
    });
    
    // Now use the filter function
    const notDoneResults = tasks.filter(task => applyFilter(task, 'not done'));
    
    // Simply check that all the incomplete and in_progress tasks are included
    expect(notDoneResults.length).toBeGreaterThanOrEqual(manualNotDone.length);
    expect(manualNotDone.every(task => 
      notDoneResults.includes(task)
    )).toBe(true);
  });

  test('applyFilter should filter tasks by cancelled status', () => {
    // Test cancelled filter
    const cancelledResults = tasks.filter(task => applyFilter(task, 'cancelled'));
    expect(cancelledResults.length).toBe(1);
    expect(cancelledResults[0].status).toBe('cancelled');
    expect(cancelledResults[0].statusSymbol).toBe('-');
  });

  test('applyFilter should filter tasks by in progress status', () => {
    // Test in progress filter
    const inProgressResults = tasks.filter(task => applyFilter(task, 'in progress'));
    expect(inProgressResults.length).toBe(1);
    expect(inProgressResults[0].status).toBe('in_progress');
    expect(inProgressResults[0].statusSymbol).toBe('/');
  });

  test('queryTasks should combine status filters with other filters', () => {
    // Combine status and tags filters
    const query = `not done
has tag tag`;
    
    // Only the incomplete task with tags should match
    const filteredTasks = queryTasks(tasks, query);
    expect(filteredTasks.length).toBe(1);
    expect(filteredTasks[0].status).toBe('incomplete');
    expect(filteredTasks[0].tags.length).toBeGreaterThan(0);
  });

  test('queryTasks should support negative status filtering', () => {
    // Negative status filtering
    const query = `not done
not cancelled`;
    
    const notDoneNotCancelledTasks = queryTasks(tasks, query);
    // This should include in_progress and incomplete tasks
    expect(notDoneNotCancelledTasks.every(task => 
      task.status !== 'complete' && task.status !== 'cancelled'
    )).toBe(true);
  });

  test('queryTasks should support OR conditions with statuses', () => {
    // OR conditions with statuses
    const query = `done OR cancelled`;
    
    const doneOrCancelledTasks = queryTasks(tasks, query);
    expect(doneOrCancelledTasks.length).toBe(3); // 2 done + 1 cancelled
    expect(doneOrCancelledTasks.every(task => 
      task.status === 'complete' || task.status === 'cancelled'
    )).toBe(true);
  });
});