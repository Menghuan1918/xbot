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
    appearance: '外观',
    theme: '主题',
    dark: '深色',
    light: '浅色',
    accentColor: '主题色',
    collapseProcess: '折叠中间过程',
    language: '语言',
  },
  designSystem: {
    title: '设计系统基础',
    themeToggle: '切换主题',
    languageToggle: '切换语言',
  },
}

export default zhCN
export type Translations = typeof zhCN
