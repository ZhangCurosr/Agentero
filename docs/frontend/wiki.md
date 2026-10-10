# 双链 UI

编辑器状态栏展示反链数量与列表。右侧 **References** 展示当前论文的参考文献卡片；数据来自参考文献 sidecar 与库内匹配，见 [../backend/citation-parsing.md](../backend/citation-parsing.md)。

## 编辑器

- `[[wikilink]]` Live Preview；光标进入显示源码。
- 输入 `[[`：文件 / frontmatter alias / 标题 / block / 批注（`@`）候选；↑↓ 在列表内循环，不关闭菜单；底部提示 `#标题 · ^文本块 · |显示文本 · @批注`。
- **Frontmatter `aliases`**：笔记 YAML 中的别名参与 file 搜索与 resolve（与 Obsidian 一致）。按别名命中时**只**出现 alias 候选（主行=别名，副行=vault 相对路径），不再额外挂一条 basename `NOTES`。选中后写入 canonical 目标（**不**自动补 `|显示名`），便于继续输入 `#` / `@`。同名 alias 多文件时列出多条，不静默选第一条。
- 嵌套标题路径没有层数限制：`[[2026-W31#07-28 周二#复盘分析#paper 阅读]]`、同文件写法与对应 `![[...]]` 均合法。
- 完整路径是标题的 canonical identity；Markdown 引用也可省略开头祖先，使用任意长度的连续路径后缀，例如唯一时 `[[2026-W31#复盘分析#paper 阅读]]` 合法。后缀命中多个标题时返回歧义，不选择第一个结果。
- 每输入一个额外 `#`，其前面的路径段成为已确认父路径，候选只显示该父标题的直接子标题。父路径本身也按后缀匹配，因此可从省略祖先的标题继续逐级补全，且没有两级或其他固定深度限制。
- 标题候选显示 canonical 路径 `外层标题 › 内层标题`，选择候选后写回完整 `外层标题#内层标题`；手写的唯一后缀保持原文。查询接受源码分隔符 `#` 和候选展示分隔符 `›`，并保留用户已输入的文件 target、alias 与 embed 标记。
- `@` 批注与 `#` / `^` 同属 fragment：`[[@id]]`、`[[papers/…/NOTES@id|alias]]`、`[[paper.pdf@id]]`、`[[…#@id]]`（与 `@id` 等价）。target 必须是可解析路径/文件名，**不要**单独用论文展示标题；面板复制默认 `[[papers/…/NOTES@id|论文标题]]`。id 来自高亮 `annotations.json` 或视觉 mark（`kind: visual`，旧 `agent-trace` 仍认；nanoid 可含 `_`）。
- 序列化必须写回 `[[...]]`（Obsidian 兼容）。
- `![[...]]`：嵌入 Markdown 区段、图片、PDF、批注（只读）；普通编辑不刷新无关嵌入。批注嵌入（`contentKind: annotation`）与其它 embed 共用 `max-h` 滚动壳；位置优先大纲路径否则页码。文字高亮与视觉批注的备注均渲染 Markdown；视觉批注的备注以图标 + 内容显示在裁剪图上方，仅当有 Agent 对话时才展示下方 transcript（无对话不显示空状态）；**正文不可点跳转**，仅顶栏 ExternalLink 打开 PDF。Host `wiki check` 校验 path + id 形态，不读 `marks/` 验存活。文字高亮的 `quote` 若对上全文译文的句对、与没有句对的整段 `source` 完全相同，或与一条划词翻译的 `quote` 相同，原文下面用更小、更弱的字显示译文，不加标签，也不写回批注。对不上、视觉批注，或没有译文文件时只显示原文。
- **导出模式**（笔记导出 PDF/PNG）：`MarkdownExportModeProvider` 下展开 `max-h`、去掉打开源按钮；图片/批注裁剪图取消高度上限；完整 PDF 附件改为路径占位。见 [markdown.md](markdown.md)。

与 **Markdown 双链**（`graph_get_graph` / 反链）分层；双链索引仍服务编辑器补全、嵌入与状态栏反链，不驱动关系图。

## 链接修复（前端触发）

- Agentero 内重命名/移动：事务化修复已解析链接。
- 外部本地 rename：按设置 `ask` / `always`。
- 外部 rename 的双链修复与警告只关注 Markdown、PDF、受支持图片和疑似目录；JSON sidecar、临时文件等明确非链接目标仍刷新工作区，但不进入双链处理。
- 显式标题重命名事务。

标题重命名、跳转和嵌入继续消费同一个结构化 `LinkFragment.path: string[]`。该数组保存 Markdown 中实际写下的完整路径或连续后缀；解析成功后再映射到唯一 canonical heading path。显式标题重命名只改写引用中实际包含的被改名路径段，省略该祖先的后缀引用保持原文。

## 关系图谱（Obsidian 风格）

Agentero 内置高性能 Obsidian 风格知识图谱视图（`agentero:graph`），支持全库 Markdown 笔记、论文条目、双链引用、标签与附件的可视化互联。

### 特性与架构

- **原生 Canvas 2D 物理引擎**：采用 Barnes-Hut 四叉树算法优化 N-body 斥力仿真（$O(N \log N)$），结合弹簧连线力、中心重力与碰撞半径。物理模拟降温稳定后（$\alpha < 0.003$）自动挂起渲染循环，实现零空闲 CPU 占用。
- **节点与边类型**：
  - **Markdown 笔记**：普通笔记文件。
  - **论文条目（入库文献）**：`papers/<id>` 自动折叠为单篇论文节点，优先读取 `meta.json` 标题或 BibTeX title，并携带作者、年份、DOI 等元数据；根据库内被引频次（入度）自适应放大节点半径。
  - **学术引用网络（Citation Network）**：并发读取入库论文的 `{paper}/source/agentero-cite.json` sidecar，提取 `localMatch` 及基于 DOI/arXiv ID/标题匹配的库内论文引用关系，生成带有方向箭头的学术引用边（靛蓝高亮）。
  - **标签**：以 `#tag` / Frontmatter `tags` 为聚类中心，形成领域知识簇。
  - **附件**：PDF、图片等资源文件（可切换显示/隐藏）。
  - **未创建笔记**：存根节点（虚线/空心呈现，支持一键点击创建或打开）。
- **交互与高亮**：
  - 丝滑平移（拖拽画布）与缩放（滚轮）。
  - 节点拖动：支持定点拖拽与力学扰动。
  - 悬停聚焦：鼠标悬停高亮直接相连的一阶邻居与边（文献节点悬停显示作者、年份、库内被引数），弱化/半透明其余非关联节点。
  - 单击导航：点击文件/论文节点直接在 Dockview 工作区打开对应标签（文献直接打开 PDF 阅读器）。
- **右上角浮动控制面板**（与 Obsidian 交互对齐）：
  - **筛选 (Filters)**：
    - 搜索文件过滤（支持标题、路径、标签、论文作者模糊匹配）。
    - 标签开关、附件开关。
    - **文献 (Papers) 开关**：一键开闭入库文献节点。
    - **文献引用 (Citations) 开关**：一键开闭文献之间的学术引用连线。
    - **仅显示文献 (Papers only) 开关**：一键切换至纯文献引用图谱视图。
    - 仅显示已创建的笔记、孤立文件开关、重置配置。
  - **颜色组 (Color Groups)**：支持添加多个规则过滤组（`tag:xxx`、`path:xxx`、关键字），自定义节点着色。
  - **外观 (Appearance)**：有向箭头开关、文本透明度滑块、节点大小倍率滑块、连线粗细滑块、播放动画（退火重启）。
  - **力度 (Forces)**：中心力、斥力大小、连线距离、连线强度滑块微调。
- **工作台集成**：
  - 侧栏顶栏快捷按钮：`Network` 图标一键打开图谱。
  - 命令面板：`⌘P` / `Ctrl+P` 输入 `打开关系图谱`。
  - 状态持久化：配置自动同步至 `localStorage`（`agentero:graph-settings`）。

## 代码

- 关系图谱：`src/components/graph/`（画布、控制面板、容器）、`src/lib/graph/`（数据提取、四叉树模拟、颜色规则、设置持久化）
- 双链面板：`src/components/wiki/`
- 逻辑：`src/lib/wiki/`、`wiki-completion.ts`、`wiki-embed.ts`、`wiki-navigation.ts`、`wiki-heading-rename.ts`
- Host：[../backend/wiki.md](../backend/wiki.md)
