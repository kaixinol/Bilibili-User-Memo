# Project Context for Subagents

## Key Entry Points
- Main: `src/index.ts`
- API Routes: `src/api/`

## Dead Code Definition
- Any function/class not imported in any `.ts/.js` file under `src/`.
- Ignore `node_modules`, `dist`, `build`.

## Logical Conflict Patterns
- Check for contradictory state updates in Redux slices.
- Check for duplicate API endpoints in `src/api/`.