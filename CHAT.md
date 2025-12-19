总结一下经验和流程,我想让它通过编写ts代码,执行ts代码,来将连续的步骤在一次代码执行中解决,因为mcporter支持ts编程进行调用。
所以我的想法是:先创建report文件夹,然后在这个report文件夹中初始化ts编程环境,我建议使用deno,因为它对ts的支持和依赖最友好,只要写好代码就能直接进行执行。
这样这个文件夹既包含了最终报告，还包含了制作报告所需的脚本文件，会更加客观可信。
在这个过程中，可以在代码中调用codex-cli来实现ai所需的一些简单工作。参考
agents/coder.md 这篇文章中提到的codex-cli的使用。
将整个过程代码化，并在代码中把中间产物直接在内存中处理掉，可以节省大量的token小号。

---

你知道 claude-code 提供了agent-sdk吗？ `@anthropic-ai/claude-agent-sdk`
就是这个npm包。 我的想法是：

1. 我们 /Users/kzf/.claude/skills/user
   这里用户技能里面，把各种能力进行封装成一个个mcp-scripts。
   - 比如
     `deno run -A ~/.claude/skills/user/scripts/search-duckduckgo.mcp.ts`|`crawl-page.mcp.ts`|`research-topic.mcp.ts`|`html2md.mcp.ts`
     等等，
   - PS: 这里只是参考你的命名，不是我要你做这些
2. 然后我们使用`@anthropic-ai/claude-agent-sdk`来启动我们的claude，其实它的本质就是`claude --help`这些能力的封装。这时候我们可以去定义tools、system-prompt、model，还有`fork-session`这种高级功能
3. 这样一来，我们可以封装成`~/.claude/skills/user/agents/runner.ts`,在这些脚本里面去调用用`@anthropic-ai/claude-agent-sdk`
   - 这里的本质差别是，我们可以注入 system-prompt、注入tools
   - 可以有效绕过CLAUDE.md和内置tools对模型的干扰，在system-prompt中提供一种工作流。面对严格的系统提示词和有限的工具，“我们的runner.ts子代理”的遵守能力就会大大增强。
4. 最后回到我们的 agents/runner.md 这里，使用 haiku 让它去执行
   `deno run -A ~/.claude/skills/user/agents/runner.ts --prompt=[PROMPT]`就行了

---

我需要你封装一个base-mcp.ts作为所有mcp开发的基础: 1.省去
`new StdioServerTransport`,默认使用stdio,但是可以用--transport=sse/http/stdio来支持更多模式2.通过`options:{autoStart:import.meta.main}`来实现自动,这样好处是mcp文件可以作为依赖被import而不会被启动3.所有的tool都可以export出去,从而可以通过编程的方式调用直接使用4.现在这些mcp只定义了input,我需要同时定义input和outpout,用类型安全来约束return返回内容5.实现之后,就可以重构我们所有的\*.workflow.ts,因为这些workflow.ts大多是要调用ai(claude-code)来工作的,而重构之后,ai-claude-code提供了直接的claudequery函数,可以让这些workflow来使用.还能享有统一session管理的能力

---

接下来,我需要你开发一个 `skills/user/meta/`
文件夹,将我们的workflow-manager.workflow.ts迁移到这个文件夹中,
这个是“元能力”,意味着能用来“管理workflows同时更新
SKILL.md”、“管理mcps同时更新mcps/README.md”

在这个文件夹中,你可以把workflow-manager.workflow.ts拆分成多个文件来维护:

- 提示词写成md文件
- 将各种命令写成独立的ts文件

完成后,我需要你更新 skills/user/meta/SKILL.md, 同时更新
/Users/kzf/.claude/commands/workflow.md 文件

---

接下来,到了最关键的时刻,我之所以设计这样一套workflow,并内置了
ai-mcp+session-management, 目的是实现一种多Agent并发工作.

请你阅读CLAUDE.md了解远景,然后开始我们最关键的一个工作,将 agents/coder.md
重构成我们的 workflow, 然后移除 coder.md, 接着到我们的 CLAUDE.md
中提供如何派发任务给 coder.workflow.ts 去执行.
注意你需要将coder的能力分发成多种mcp,然后再组装成这个workflow

---

我看到你的设计了,我觉得这个设计被yargs带偏了
先忘记yargs,也许它的作用只是一个parseArgs,不是那么重要。
重要的是我们需要去定义和设计我们的workflow:

1. 我看到commands,我的想法是我们用
   subflows来定义子流程:实现workflow之间可以自由嵌套
2. 因为可以自由嵌套,所以我们的--help默认只打印出当前。层级的帮助信息(主要是描述+参数信息+补充说明+子流程的名字和描述),但是可以用`--help=all`来打印出全部的流程信息(这里就要考虑循环引用因素,避免重复打印).
3. 因为可以自由嵌套,所以我们可以用`workflow_name- subflow_name subflow_name --help`这样来深入调用某一个子流程

基于我这份设计,我需要你重新实现defineWorkflow,我我建议放弃对yargs的依赖,它太重了

---

我们的workflow理论上有两种基础实现:

1. 一种是AI驱动的工作流, 就是说主体 workflow 是AI驱动执行的, 那就是基于提示词 +
   mcp
   - 重点强调一下,我们的 meta.mcp.ts 需要 export 一个 buildMetaMcp,
     它的作用就是将 workflows 打包组合成一个 mcp
   - 所以基于以上两点,我们的AI启动的workflow, 可以包含
     mcp,这里的mcp中有有一个meta-mcp能包含workflow,
     然后就可以基于提示词去实现一种个AI自己决策驱动的工作流模式
2. 一种编程驱动的工作流, 就是说主体 workflow 是编程驱动执行的
   - 它同样也可以执行mcp,同样也可以执行subflows,因为我们这的mcp本质上都是一个个工具,都通过esm导出可以通过编程去使用,
     workflow也是如此,通过esm导出可以通过编程使用

在这些基础实现的基础上,配合我们的workflow可以自由嵌套的逻辑,我们可以实现AI驱动+程序驱动这种“混合调度逻辑”;或者通过嵌套实现AI驱动+程序驱动的“智能调度逻辑”;或者说一个workflow既可以实现AI驱动又可以实现驱动编程的“多模式”.

如果你理解了以上的内容,那么开始新一轮的工作:

1. 请你更新 create.workflow.ts 的提示词, 并优化 create.workflow.ts
2. 重新更新所有workflow, 好好分析它们是属于哪种驱动模式:
   AI驱动?编程驱动?混合调度逻辑?智能调度逻辑?多模式? 然后进行重构

---

我看到了,这里的核心问题是createMcpServerConfig是基于deno去执行命令行.我的想法是:

1. 我们使用动态import的方式直接导入ts文件
2. 然后我们去执行 mcpServer.start 来启动mcp, 但我们使用的是
   WebStandardStreamableHTTPServerTransport
   来启动这个实例,这样我们就可以通过绑定一个随机的端口,然后通过这个http服务来进行路由:`http://localhost:12315/mcp/<mcp_name>`

---

我希望的效果还是 `deno run -A jsr@jixo/flow install` 执行安装,
然后全局就有了`jixoflow`这个cli, 同时将这个项目clone到本地的 `~/.jixoflow` 目录.

---

1. 执行 `jixoflow env` 可以打印出一个默认 `JIXOHOME=~/.jixoflow`
   目录,用户可以自己修改 环境变量 JIXOHOME 来改变 JIXOHOME
2. 执行 `jixoflow mcp` 就是在执行 `deno run -A $JIXOHOME/meta/meta.mcp.ts`

---

我定义了一个 preferences.json 文件,
它的作用是用来控制整个程序运行的时候一些默认偏好.
比如我们底层很多地方都是ai驱动的, 程序里面主要配置是控制了一些提示词和默认参数,
但是具体用什么AI-Agent(claude-code还是codex,还是未来可能支持更多)?对这些Agent是否有什么特定的修改,
比如如果 codex 模型可用, 那么参数是什么,如果codex模型不可用, 备用方案是什么.
还可以配置重试机制(最大重试次数、重试间隔)等等

还有,我开了一个user文件夹. 这个文件夹中,也能有 workflows/mcps
文件夹,我们的meta也能发现这些文件, 如果同名,那么对我们
buildin对workflow/mcp做覆盖.
user文件夹中还包含了一个prompts文件夹,这里会有一个`user-proxy.md`, 目的是让
user-proxy.mcp 是来读取这个文件而不是内置提示词 同理有一些允许一定扩展性的,
规范上都需要来这个文件夹来做自定义配置.

请你完成这些需求,然后更新我们的白皮书

---

然后我们需要更新我们的meta中的“元能力”,因为我们引入了user文件夹,因此create行为默认是作用到user文件夹.
create还要支持`--override`,这里有两种可能:

1. 如果 user-workflows/mcps 有指定的目标,那就是覆盖 user-workflows/mcps 的内容
2. 否则就是针对本项目 buildin-workflows/mcps , 其override逻辑也是到
   user-workflows/mcps 中去创建同名的 workflow/mcp 文件.

完成以上任务请同步更新白皮书

---

我们的 cli.ts 做 install 时候, 要支持自定义来源: 可以是一个本地文件夹,
也可以是一个自定义的 git 链接.
我们需要有一个配置文件(被gitignore的)记住这个source 然后我们要实现 update 命令,
从而实现从 source 进行更新,如果source是文件夹,那么就重新复制覆盖,
只保留user目录, 如果是git仓库,那么直接git-pull

---

我打算重构 preferences.json:

1. 底层还是这套配置, 但是用户可以使用 preferences.ts 来进行配置,
   从而获得类型安全, 并且配置起来可以更加灵活.
2. 能进行轮询更新, 默认轮询时间是10s, 就是说每过 10s 重新
   `import('preferences.ts')` 执行获取配置
   1. 小循环: 如果异常, 那么每间隔3s重新执行一次,直到成功
   2. 大循环: 每间隔10s重新执行一次,注意不是单纯地固定10s,而是
      `loop { await getConfig(); await sleep(10s) }`
3. 在我们启动 `cli mcp`(指`meta.mcp.ts`)之后, 我需要默认 30s
   进行一次重新更新构建, 这样做的好处是,
   有些AIAgent在重新通过mcp协议listTools的时候, 能确保获取到最新的内容
   - 如果不这样做, 一些Agent能长期工作不做释放, 而我们又是那种自发现的机制.
     所以我们自己进程不重启也要能支持自动刷新重载
4. `meta.mcp.ts`目前只提供了一个workflow工具, 我还需要提供一个 reload 工具,
   是方便AIAgent能主动进行获取, 返回的内容其实就是workflow这个工具的description,
   这个description包含了所有可用的workflow
5. 重新检查一下 preferences 的配置,是否有全面应用,是否有全面测试

---

接下来, 我们需要将main分支设置为保护分支. 所有的工作必须通过pr来合并到主分支.

因此我需要你配置一套严格的CI/CD.并且将我们的docs发布到github-page

---

我们需要进一步完善我们这里关于 ai 的偏好定义. 首先, 我们需要区分一些概念:

1. 如果没有偏好配置, 那么我们仍然可以使用这些AI, 只不过使用的是“空配置”,
   其实也就是用户的全局配置
   - 注意,我看到很多地方你写`claude-sonnet-4-20250514`或者`codex-mini`,
     不要这样写,
     直接放空就好,因为模型是一直在更新的,这种写法会导致用户被误导、导致用户需要频繁更新
   - claude-code官方的建议也就是三档:haiku、sonnet、opus
     这样就行,不用那么精细的模型编号
   - codex官方模型就一个档位,但是是配合五个model_reasoning_effort档位,这也是一种抽象的模式
2. 默认的顺序是 claude, 然后是 codex
3. 偏好配置不一定要用 claude-code/ codex 去命名,应该是自由的命名.
   但是因为我们内置 claude-code-agent-sdk
   和codex-agent-sdk,所以我们需要提供的写法应该是:
   ```ts
   p.ai((ai)=>ai
     .profile("my-claude-opus", (p)=>p.useClaudeCodeAgentSdk({...}))
     .profile("my-claude-sonnet", (p)=>p.useClaudeCodeAgentSdk({...}))
     .profile("my-codex-xhight", (p)=>p.useCodexAgent({...,threadOptions:...}).retry({...}))
     .profile("my-codex-medium", (p)=>p.useCodexAgent({...,threadOptions:...}).retry({...}))
     .default("my-claude-opus", "my-claude-sonnet", "my-codex-xhight")
     .retry(...)
     .build() // 如果发现返回的是 `extends Builder`, 会自动调用 build. 这里我只是强调一种架构
   )
   .workflow("git-committer",w=>w.aiProfile("my-codex-medium"))
   .mcp("git-committer",m=>m.aiProfile("my-codex-medium"))
   ```

---

现在我们的perferences和我们的系统联动起来测试了吗?你有确定我们的配置能正确生效吗?
因为其特殊性,我个人建议你使用`node:async_hooks`中的AsyncLocalStorage,把它封装成
AsyncContext.

这样能在整个系统中低入侵地将我们的偏好作用到整个系统中.而不用浪费参数传递

---

我们需要优化一下我们内置的模型偏好的顺序, 我们的底层其实有两套提供方,
目前claude-code是作为第一提供方,这并不公平. 我们需要改进一下,改成:
如果env.CLAUDECODE==='1',那么提高 claude-code-agent 的权重, 如果有 CODEX_SANDBOX
这个字段,不论什么值, 提高codex-agent 的权重. 注意,我们需要将权重写到 env中,
例如`env.JIXOFLOW_CLAUDECODE_WEIGHT+=1`. 这种设计是因为我们

---

接下来我们将深入改进我们的buildin-mcp/workflow 首先是
