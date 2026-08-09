# Gal 百宝箱

面向中文 Galgame 用户的图像化、联想化知识探索工具。数据来自 VNDB Kana API。

当前仓库先实现一个最小闭环：

`搜索 VN → 查看封面和配音关系 → 打开角色/声优 → 查看声优配过的角色 → 从角色回到其他 VN`

## 项目结构

```text
apps/
  api/   VNDB 适配层、稳定 DTO、限流与 SQLite 缓存
  web/   React Web 客户端
docs/
  mvp-spec.md       MVP 产品规格
  api-contract.md   前后端接口契约
  project-summary.md 长期交接记录
```

## 界面快照

![作品详情桌面端](output/playwright/mvp-desktop.png)

![声优详情移动端](output/playwright/mvp-mobile.png)

## 本地运行

```powershell
npm.cmd install
npm.cmd run dev
```

- Web: http://localhost:5173
- API: http://localhost:8787

## 验证

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## 数据与许可

- VNDB API 免费使用条款以非商业用途为前提；商业化前需与 VNDB 确认。
- VNDB 数据受其 Data License 约束。
- 图片 URL 指向 VNDB/CDN；本项目不永久镜像图片。
- 声优实体在 VNDB API 中没有头像，界面使用其关联角色图像作为视觉线索。
