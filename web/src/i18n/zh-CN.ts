/**
 * zh-CN translation resources (Spec 1 设计系统基础).
 */
const zhCN = {
  common: {
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    rename: '重命名',
    search: '搜索',
    close: '关闭',
    new: '新建',
    loading: '加载中...',
    error: '错误',
    retry: '重试',
  },
  sidebar: {
    sessions: '会话',
    files: '文件',
    search: '搜索',
    diff: '差异',
    config: '配置',
  },
  session: {
    all: '全部',
    byChannel: '渠道',
    byTime: '时间',
    byStatus: '状态',
    newSession: '新建会话',
    workPath: '工作路径',
    starred: '已标星',
    status: {
      running: '运行中',
      waiting: '等待输入',
      idle: '空闲',
      error: '异常',
    },
  },
  workspace: {
    agent: 'Agent',
    file: '文件',
    terminal: '终端',
    preview: '预览',
    edit: '编辑',
    splitRight: '右侧分屏',
    closeTab: '关闭标签',
  },
  settings: {
    title: '设置',
    // navigation
    nav: {
      general: '通用',
      appearance: '外观',
      collapse: '折叠',
      language: '语言',
      llm: 'LLM 配置',
    },
    // appearance
    theme: '主题',
    dark: '深色',
    light: '浅色',
    accentColor: '主题色',
    accentCustom: '自定义',
    accentCustomHint: '输入十六进制色值，如 #3388BB',
    accentInvalid: '无效的颜色值',
    preview: '预览',
    // collapse
    collapseProcess: '折叠中间过程',
    collapseLevel: '折叠程度',
    collapseLevelDesc: '控制 Agent 中间过程（工具调用/推理）的显示方式',
    collapseAll: '全部折叠',
    collapseAllDesc: '只显示最终输出',
    collapseMinimal: '最小显示',
    collapseMinimalDesc: '显示工具名与摘要，折叠详情',
    collapseNone: '全部展开',
    collapseNoneDesc: '展开所有中间过程',
    // language
    language: '语言',
    languageDesc: '界面显示语言',
    chinese: '中文',
    english: 'English',
    // llm
    model: '模型',
    modelDesc: '选择当前使用的 LLM 模型',
    maxContext: '最大上下文',
    maxContextDesc: '对话上下文的最大 token 数',
    maxOutputTokens: '最大输出 Token',
    maxOutputTokensDesc: '单次回复的最大 token 数',
    thinkingMode: '思考模式',
    thinkingModeDesc: '推理/思考行为（留空表示自动）',
    loading: '加载中...',
    loadFailed: '加载失败',
    saved: '已保存',
    saveFailed: '保存失败',
    notConnected: '未连接服务器',
  },
  designSystem: {
    title: '设计系统基础',
    themeToggle: '切换主题',
    languageToggle: '切换语言',
  },
}

export default zhCN
export type Translations = typeof zhCN
