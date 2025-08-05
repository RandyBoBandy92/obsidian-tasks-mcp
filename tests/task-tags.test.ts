import { queryTasks } from '../src/index.js';
import { applyFilter, parseTaskLine, Task } from '../src/TaskParser.js';

describe('Task Tag Filtering', () => {
  // Disable the server auto-start for tests
  process.env.DISABLE_SERVER = 'true';

  // Sample tasks with various tag formats for testing
  const testTasks = [
    `- [ ] Basic task with no tags`,
    `- [ ] Task with #tag`,
    `- [ ] Task with #multiple #tags`,
    `- [ ] Task with #project/subtag hierarchy`,
    `- [ ] Task with #important and some text`,
    `- [x] Completed task with #priority #high tags`,
    `- [ ] Task with "quoted #tag text"`,
    `- [ ] Task with #tag-with-dashes`,
    `- [ ] Task with #123 numeric tag`
  ];

  // Parse the test tasks
  const tasks = testTasks.map((line, index) => 
    parseTaskLine(line, `/test/tagfile${Math.floor(index/3)}.md`, index)
  ).filter(task => task !== null) as Task[];

  test('tasks should be parsed with correct tags', () => {
    // Verify that all tasks were parsed
    expect(tasks.length).toBe(9);
    
    // Check tag extraction for specific tasks
    expect(tasks[0].tags).toEqual([]);
    expect(tasks[1].tags).toContainEqual('#tag');
    expect(tasks[2].tags).toEqual(expect.arrayContaining(['#multiple', '#tags']));
    expect(tasks[3].tags).toContainEqual('#project/subtag');
    expect(tasks[5].tags).toEqual(expect.arrayContaining(['#priority', '#high']));
    expect(tasks[7].tags).toContainEqual('#tag-with-dashes');
    expect(tasks[8].tags).toContainEqual('#123');
  });

  test('applyFilter should filter tasks by exact tag matches', () => {
    // Filter by exact tag match
    const tagResults = tasks.filter(task => applyFilter(task, 'has tag tag'));
    // We expect two tasks to have exactly the tag "tag"
    expect(tagResults.length).toBe(2);
    
    // Both tasks should have the #tag tag
    expect(tagResults.every(task => task.tags.includes('#tag'))).toBe(true);
    
    // One should be "Task with #tag"
    expect(tagResults.some(task => task.description === 'Task with #tag')).toBe(true);
    
    // The other has the tag in quoted text
    expect(tagResults.some(task => task.description === 'Task with "quoted #tag text"')).toBe(true);
  });

  test('applyFilter should filter tasks by partial tag matches', () => {
    // Filter by partial tag match
    const partialTagResults = tasks.filter(task => applyFilter(task, 'tag includes pri'));
    expect(partialTagResults.length).toBe(1);
    expect(partialTagResults[0].tags).toContainEqual('#priority');
  });

  test('applyFilter should handle hierarchical tags', () => {
    // Filter by hierarchical tag
    const hierarchicalTagResults = tasks.filter(task => applyFilter(task, 'has tag project/subtag'));
    expect(hierarchicalTagResults.length).toBe(1);
    expect(hierarchicalTagResults[0].tags).toContainEqual('#project/subtag');
  });

  test('applyFilter should filter tasks with no tags', () => {
    // Filter tasks with no tags
    const noTagsResults = tasks.filter(task => applyFilter(task, 'no tags'));
    expect(noTagsResults.length).toBe(1);
    expect(noTagsResults[0].description).toBe('Basic task with no tags');
  });

  test('applyFilter should filter tasks with any tags', () => {
    // Filter tasks with any tags
    const hasTagsResults = tasks.filter(task => applyFilter(task, 'has tags'));
    expect(hasTagsResults.length).toBe(8);
    expect(hasTagsResults.every(task => task.tags.length > 0)).toBe(true);
  });

  test('queryTasks should combine multiple tag filters with AND logic', () => {
    // Filter by multiple criteria
    const query = `has tag high
has tag priority`;
    
    const multiTagResults = queryTasks(tasks, query);
    expect(multiTagResults.length).toBe(1);
    expect(multiTagResults[0].tags).toEqual(expect.arrayContaining(['#priority', '#high']));
  });

  test('queryTasks should combine tag filters with status filters', () => {
    // Combine tag and status filters
    const query = `has tag high
done`;
    
    const tagAndStatusResults = queryTasks(tasks, query);
    expect(tagAndStatusResults.length).toBe(1);
    expect(tagAndStatusResults[0].status).toBe('complete');
    expect(tagAndStatusResults[0].tags).toContainEqual('#high');
  });

  test('queryTasks should support negative tag filtering', () => {
    // Negative tag filtering
    const query = `not has tag high`;
    
    const negativeTagResults = queryTasks(tasks, query);
    expect(negativeTagResults.length).toBe(8);
    expect(negativeTagResults.every(task => !task.tags.includes('#high'))).toBe(true);
  });

  test('queryTasks should support OR conditions with tags', () => {
    // OR conditions with tags
    const query = `has tag high OR has tag project/subtag`;
    
    const orTagResults = queryTasks(tasks, query);
    expect(orTagResults.length).toBe(2);
    expect(orTagResults.some(task => task.tags.includes('#high'))).toBe(true);
    expect(orTagResults.some(task => task.tags.includes('#project/subtag'))).toBe(true);
  });

  test('queryTasks should filter tags across multiple files', () => {
    // Group tasks by file path
    const fileGroups = tasks.reduce((acc, task) => {
      const filePath = task.filePath;
      if (!acc[filePath]) {
        acc[filePath] = [];
      }
      acc[filePath].push(task);
      return acc;
    }, {} as Record<string, Task[]>);
    
    // Verify we have multiple files
    expect(Object.keys(fileGroups).length).toBeGreaterThan(1);
    
    // Filter tasks across all files
    const query = `has tags`;
    const taggedTasksAcrossFiles = queryTasks(tasks, query);
    
    // Verify tasks come from multiple files
    const uniqueFilePaths = [...new Set(taggedTasksAcrossFiles.map(task => task.filePath))];
    expect(uniqueFilePaths.length).toBeGreaterThan(1);
  });
});