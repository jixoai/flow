# defineWorkflow

定义一个 Workflow。

## 签名

```typescript
function defineWorkflow<TArgs extends ArgsDef>(
  config: WorkflowConfig<TArgs>,
): Workflow<TArgs>;
```

## WorkflowConfig

```typescript
interface WorkflowConfig<TArgs> {
  name: string;
  description?: string;
  version?: string;
  args?: TArgs;
  subflows?: SubflowDef[];
  examples?: Array<[string, string]>;
  handler: (args: InferArgs<TArgs>, ctx: WorkflowContext) => Promise<void>;
  autoStart?: boolean;
}
```

## 参数定义

```typescript
type ArgsDef = Record<string, {
  type: "string" | "number" | "boolean";
  alias?: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
}>;
```

## 子流程定义

```typescript
type SubflowDef =
  | Workflow<any> // 直接引用
  | (() => Promise<Workflow<any>>); // 懒加载
```

## WorkflowContext

```typescript
interface WorkflowContext {
  meta: { name: string; description?: string; version: string };
  path: string[];
  rawArgs: string[];
  getSubflow: (name: string) => Promise<Workflow | undefined>;
  subflowNames: () => Promise<string[]>;
}
```

## 返回值

```typescript
interface Workflow<TArgs> {
  meta: { name: string; description?: string; version: string };
  execute: (args: Partial<InferArgs<TArgs>>) => Promise<void>;
  showHelp: (all?: boolean) => Promise<void>;
}
```

## 示例

```typescript
export const workflow = defineWorkflow({
  name: "example",
  description: "Example workflow",
  args: {
    prompt: { type: "string", alias: "p", required: true },
    verbose: { type: "boolean", alias: "v", default: false },
  },
  subflows: [
    subWorkflow,
    () => import("./lazy.workflow.ts").then((m) => m.workflow),
  ],
  handler: async (args, ctx) => {
    console.log(`Running: ${ctx.meta.name}`);
    console.log(`Prompt: ${args.prompt}`);
  },
  autoStart: import.meta.main,
});
```
