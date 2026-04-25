```markdown
# priors Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `priors` TypeScript repository. It covers file organization, import/export styles, commit message conventions, and testing patterns. By following these guidelines, contributors can maintain consistency and quality across the codebase.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `myUtility.ts`, `dataFetcher.ts`

### Import Style
- Use **relative imports** for modules within the project.
  - Example:
    ```typescript
    import { fetchData } from './dataFetcher';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```typescript
    // dataFetcher.ts
    export function fetchData() { /* ... */ }
    ```

### Commit Messages
- Follow **conventional commit** style.
- Use the `chore` prefix for maintenance and non-feature commits.
  - Example:
    ```
    chore: update dependencies to latest versions
    ```

## Workflows

### Code Maintenance
**Trigger:** When updating dependencies, refactoring, or making non-feature changes  
**Command:** `/chore`

1. Make your changes following the coding conventions.
2. Stage and commit your changes with a message starting with `chore:`.
   - Example:
     ```
     chore: refactor dataFetcher for improved readability
     ```
3. Push your changes and open a pull request if necessary.

## Testing Patterns

- Test files follow the `*.test.*` naming pattern.
  - Example: `dataFetcher.test.ts`
- The testing framework is **unknown** (not detected), but tests should be placed alongside the code or in a dedicated test directory using the above pattern.
- Example test file:
  ```typescript
  // dataFetcher.test.ts
  import { fetchData } from './dataFetcher';

  test('fetchData returns expected result', () => {
    // Test implementation here
  });
  ```

## Commands
| Command   | Purpose                                         |
|-----------|-------------------------------------------------|
| /chore    | Run code maintenance or non-feature workflows   |
```