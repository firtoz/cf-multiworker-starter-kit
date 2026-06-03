---
name: react-patterns
description: React patterns for callbacks, event handlers, JSX handler typing, and module-level constants. Use when writing React components, implementing event handlers, typing JSX handlers, or defining constants.
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

## Event Handler Types

Prefer the JSX handler aliases for React props instead of deprecated event object aliases.

```typescript
import type {
	ChangeEventHandler,
	FormEventHandler,
	InputEventHandler,
	KeyboardEventHandler,
	MouseEventHandler,
} from "react";

const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
	event.preventDefault();
};

const handleTextInput: InputEventHandler<HTMLTextAreaElement> = (event) => {
	// `onInput` on textareas and inputs uses InputEventHandler.
};

const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
	// `onChange` uses ChangeEventHandler.
};

const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
	// ...
};

const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
	// ...
};
```

- Use the handler alias that matches the JSX prop.
- Avoid deprecated aliases like `FormEvent` when typing handler parameters.
- If a handler is only used inline, let JSX infer it instead of importing a type just to repeat it.
- For textareas, `onInput` and `onKeyDown` are often the right pair for auto-resize and submit-on-Enter behaviors.

## Class Names

Use the local `cn` helper for conditional or dynamic class names instead of string concatenation or template literal interpolation.

```typescript
import { cn } from "~/lib/cn";

<div
	className={cn({
		"base classes": true,
		active: isActive,
		"opacity-50": isDisabled,
	})}
/>
<li
	className={cn({
		"border-green-300 bg-green-50": isCurrent,
		"border-gray-200 bg-white": !isCurrent,
	})}
/>
```

- Prefer object syntax with `cn({ "class-a": condition, "class-b": !condition })` for boolean-driven classes and mutually exclusive branches, especially for `checked ? ... : ...` or `isCurrent ? ... : ...` cases.
- Keep static class strings inline unless the same combination is reused in more than one place.
- Reach for `cn` whenever a class string depends on props, state, or a boolean branch.

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
