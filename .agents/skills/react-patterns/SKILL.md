---
name: react-patterns
description: React patterns for callbacks, event handlers, and module-level constants. Use when writing React components, implementing event handlers, or defining constants.
---

# React Patterns

## Callbacks and Event Handlers

Use `useCallback` for callbacks and event handlers to ensure stable references and optimal performance.

```typescript
const handleClick = useCallback(() => {
  // Handler logic
}, [dependencies]);

const handleChange = useCallback((value: string) => {
  setState(value);
}, [setState]);
```

Use `useEffectEvent` for callbacks inside effects when you need to reference the latest props/state without adding them to dependencies:

```typescript
import { useEffectEvent } from "react";

function Component({ onUpdate }) {
  const [value, setValue] = useState("");
  
  // Latest props/state without re-triggering effect
  const handleUpdate = useEffectEvent(() => {
    onUpdate(value);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      handleUpdate(); // Always calls with latest value
    }, 1000);
    return () => clearInterval(interval);
  }, []); // No dependencies needed
}
```

## Module-Level Constants

Define true constants at module level, not inside components. Constants that never change should be defined once, not recreated on every render.

```typescript
// ✅ Good - Module level constant
const DEFAULT_CONFIG = {
  timeout: 5000,
  retries: 3,
};

const DEFAULT_HERO_JSON: JSONContent = {
  type: "doc",
  content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] }],
};

export default function MyComponent() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  // ...
}
```

```typescript
// ❌ Bad - Constant recreated on every render
export default function MyComponent() {
  const defaultConfig = {
    timeout: 5000,
    retries: 3,
  };
  
  const [config, setConfig] = useState(defaultConfig);
  // ...
}
```

Benefits of module-level constants:
- Reduces memory allocations
- Improves performance
- Makes it clear the value is truly constant
- Allows reuse across multiple components if needed

### When to Use Module-Level Constants

- Default JSON structures (e.g. API response shapes)
- Configuration objects that never change
- Static arrays or maps used for rendering
- Default form values
- Regex patterns

### When NOT to Use

- Values that depend on props or state
- Values computed from runtime data
- Anything that needs to be memoized with `useMemo`
