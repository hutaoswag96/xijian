# 息见 · GitHub访问版

保留“击球／观察／抛球”、股息历史位置、参考线、历史检验、自选分组、持仓和到账记账。

GitHub Pages 不运行实时后端。本版本直接从浏览器查询允许的公开行情源；有来源限制时，明确使用带日期的公开数据快照。快照由 GitHub Actions 定期更新，超过72小时会暂停参考，不伪装成实时数据。

个人自选、持仓、交易和分红到账仅保存在当前浏览器；支持文件导出与恢复。GitHub版不使用原网站的ChatGPT访问身份，也不会公开或自动迁移其账号备份。GitHub版暂不提供云端账号备份或反馈入库。

## 构建

需要Node.js 24，无需安装第三方依赖。

```
node --test tests/*.test.mjs
node scripts/build-pages.mjs
node scripts/refresh-data.mjs
```

`docs/` 是静态发布目录；`github/watch-symbols.json` 只配置公开行情快照的代码，不是系统推荐，不含任何个人账本。配置外股票会尝试直接查询，源不可达时明确显示失败。

本地运行可使用任何静态HTTP服务打开docs/；不要直接双击file://网页，否则浏览器可能禁止模块导入。

## 原网站

原网站与GitHub版本分别部署。原网站的实时服务器、账号备份、数据库和访问权限未改变。

参考不保证收益，也不保证提升买卖胜率。GitHub Pages在不同中国网络上的连通性仍需要实际访问验证，迁移不能保证所有运营商均可达。

访问网址：https://hutaoswag96.github.io/xijian/
