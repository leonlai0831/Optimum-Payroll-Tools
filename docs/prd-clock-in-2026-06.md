# Clock-in / 教练工时自报系统 — PRD(v1)

> 用 [pm-skills](https://github.com/deanpeters/Product-Manager-Skills) 的 `write-prd`
> / `prd-development` skill 写成。承接 `docs/jtbd-2026-06.md`(第二类用户 + 「打卡系统」一节)。
>
> - 日期:2026-06-13 · 状态:**草案 — 新增「前台」角色后,余 1 个待决(前台工时 → 津贴换算,§10);其余已定**
> - 范围由运营 2026-06-13 的四点回答锁定(见各节标注的 Q1–Q4)

---

## 1. Executive Summary

让 swim **教练 + 前台**成为系统的**直接用户**:每月通过手机**自报工时** —— 教练按课(中心 + 班型 +
时长 + 固定/替补),前台按班次(几点到几点,**无班型**)—— 经 **admin 审核通过**后,自动生成
**Staff Allowance** 和 **Freelancer Payment** 所需的**工时数据**,顶掉运营每月最烦的手工录工时。
**KPI Bonus 不在本期范围**(走另一套学生数据系统,Q3)。

## 2. Problem Statement

- **谁有问题**:运营 / admin(每月手工把每位教练的工时敲进津贴和自由教练计算器);教练(工时靠口头/纸面回报,黑箱,易争议)。
- **问题是什么**:工时是 Allowance(`teachingRows` + `opHours`/`leaveHours`)和 Freelancer(每中心 fixed/replaced 小时)的**核心输入**,目前**全靠手工录入**。
- **为什么痛**:几百人 × 每月,耗时、易错、无审计;教练无自助入口,沟通成本高(JTBD 第一、二类的最痛项)。
- **证据**:`lib/allowance/types.ts`(teaching 按小时计)、`lib/freelancer/calc.ts`(按 fixed/replaced 小时计);HANDOFF 列出「每月手工录工时」与「教练为薪资来回 WhatsApp」。

## 3. Target Users & Personas

- **主 persona — 教练 / 自由教练**(全职 + ~180 自由):按课自报工时(中心 + 班型 + 固定/替补)。
- **主 persona — 前台 / Front Desk**(津贴 tier A1–A3):按**班次**自报「几点到几点」,**无班型、无固定/替补**;其津贴本就「只算 attendance」。
- **主 persona — admin / 主管**:逐条 / 批量审核打卡,要手机友好的审核队列。
- **次 persona — 运营(发薪人)**:在计算器里**一键载入**本月已审核工时,而非手敲。
- **JTBD**:员工「记录我整月做了什么、拿应得的钱、不被少算」;admin「快速核准真实工时,挡住虚报」。
- **Roster 范围**:打卡覆盖**教练 + 前台**(凡需记工时的在职员工);不同于 Assessment(只 instructor)。

## 4. Strategic Context

- 对上 `ROADMAP` 与 JTBD 的 **P2 战略方向:让教练 + 前台成为直接用户**。
- 复用现有成熟模式,**低架构风险**:
  - **审核工作流** 复用 Lesson Plan 的 `draft → submitted → approved / changes_requested`(`lib/lesson-plan/access.ts`)。
  - **班型选择 UI** 沿用 assessment / lesson-plan 的选择器(Low/Medium/High 已存在于教案模板)。
  - **能力矩阵**:教练得 `submit_timesheet`(仅见自己,类比 `edit_lesson_plans`);admin/主管得 `review_timesheet`(类比 `review_lesson_plans`)。
  - **审计**:每次 submit/approve/reject 落 `audit_log`。

## 5. Solution Overview

**核心流程**
1. **新增打卡条目(两种模式,按角色)**:
   - **教练(lesson 模式)**:日期 · 中心 · **班型(7 类:Low/Medium/High/Adult/Young Swimmer/Precomp/Lifesaving)** · 时长(小时) · **固定/替补(逐条标记)** · 备注。
   - **前台(shift 模式,A1–A3)**:日期 · 中心 · **班次起讫(几点到几点 → 自动算工时)** · 备注。**无班型、无固定/替补**。
2. 教练**提交**整月 → 状态 `submitted`。
3. admin **审核**:可**逐条**、也可**多选勾选批量** approve / reject(reject 退回可改重交)。**必须审核通过才进发薪**(Q4)。
4. 审核通过的条目按月**聚合**:
   - → **Allowance**:按 `中心` 汇总教学小时,7 类班型并进现有 3 档 `teachingRows`
     (Low/Med/High/Adult → `normalH`、Young Swimmer → `ysH`、Precomp/Lifesaving → `precompH`)。
     **出勤部分(`opHours`/`leaveHours`)v1 不由打卡产生**(仍手工/另系统)。**不改费率表**。
   - → **Freelancer**:按 `中心 + 固定/替补` 汇总小时(费率只按职位 × 中心组,与班型无关)。
   - → **Allowance(前台 A1–A3)**:按月汇总**实到工时** → 喂其 attendance-only 津贴(**换算方式见 §10 待决**)。
5. 运营在 Allowance / Freelancer 计算器里**「从打卡载入」**(类比 KPI 的 `?ingest=` 载入),工时预填、可改。

**数据模型(建议)**:新表 `timesheets`:`coachId, date, center, entryType('lesson'|'shift'), classType?, slotType?(fixed|replaced), startTime?, endTime?, hours, status, note, reviewedBy, reviewedAt`。教练 = `lesson`(带 classType/slotType);前台 = `shift`(带 startTime/endTime,hours 由起讫推导,classType/slotType 为空)。状态机同教案;不硬删,审计留痕。

## 6. Success Metrics

- **主指标**:月度工时中**经打卡自动生成**的占比(目标:Allowance + Freelancer 工时 ≥ 90% 来自打卡,取代手敲)。
- 运营每月**手工录工时耗时**下降(现状几小时 → 目标接近 0)。
- 审核**周转时间**(submit → approved 中位数)。
- 自报 vs 审核后工时的**改动率**(衡量自报质量 / 虚报)。

## 7. User Stories & Requirements

- **US1**(教练):作为教练,我能在手机上新增/编辑/删除本月打卡条目(中心 + 班型 + 时长 + 固定/替补),并看到提交状态。
  - AC:仅能看/改自己的;`submitted` 后改动退回 `draft`(同教案「改动即回草稿」);班型为 7 类固定枚举;固定/替补必选。
- **US2**(教练):我能一键提交整月待审。
- **US3**(admin):作为 admin,我能看到「待审核」队列,**逐条或多选勾选批量** approve / reject 并附理由。
  - AC:仅 `review_timesheet` 可见全部;支持单条与批量两种操作;每次裁决落审计。
- **US4**(运营):在 Allowance/Freelancer 计算器里一键载入某教练某月**已审核**工时。
  - AC:仅聚合 `approved` 条目;载入后仍可手改;未审核的不参与。
- **US5**(系统):同一员工同月重复提交/审核有幂等与并发保护(参照现有 advisory-lock 约定)。
- **US6**(前台):作为前台,我能在手机上按班次记录「日期 + 中心 + 几点到几点」,**无需选班型/固定替补**,提交待审。
  - AC:`shift` 模式;工时由起讫自动算;审核流、自审计、改动回草稿等同 US1。

## 8. Out of Scope(v1 明确不做)

- ❌ **喂 KPI Bonus**:KPI 学生进度数据走另一套系统,两边不共享(Q3)。
- ❌ **学生到课记录**:另有学生 attendance 系统(Q1)。
- ⚠️ **教练津贴出勤(opHours/leaveHours)+ freelancer absent 标记**:v1 不由打卡产生,仍手工/另系统(已决)。
- ⚠️ **前台 A1–A3 实到工时 → attendance 津贴的换算**:见 §10 待决(可能需排班/应到工时)。
- ❌ 排班/课表生成、薪资以外的报表。

## 9. Dependencies & Risks

- **依赖**:能力矩阵新增两项(`submit_timesheet` / `review_timesheet`);审核工作流复用教案模式。(津贴费率表**无需改** — §10 已决)
- **风险与缓解**:
  - *自报虚高* → admin 必审(Q4)+ 审计 + 自报/审核改动率监控。
  - ~~班型↔费率对不上~~ → **已解决**:7 类并进现有 3 档费率,不改费率表,payroll 风险消除。
  - *采纳率低(员工不打卡)* → 手机优先 UX、提交截止提醒;必要时 admin 代录。
  - ~~固定/替补未捕获~~ → **已解决**:逐条标记固定/替补(§10),freelancer 计费可算准。
  - *前台工时 → 津贴换算未定(§10)* → 决定前台能否闭环到发薪;否则 v1 前台只到「记录 + 审核」。

## 10. Open Questions

### ✅ 已决(2026-06-13)— 班型 ↔ 津贴费率映射

打卡班型为 **7 类**,聚合并进现有 **3 档**津贴费率(**不改费率表**):

| 打卡班型 | 津贴费率 bucket |
| --- | --- |
| Low / Medium / High / Adult(learn-to-swim) | `normal` |
| Young Swimmer | `youngSwimmer` |
| **Precomp / Lifesaving**(新增 2 个打卡班型) | `precompLifesaving` |

### ✅ 已决(2026-06-13)— 其余

- **固定 vs 替补**:教练打卡**逐条标记**固定/替补(自报、admin 审);驱动 freelancer 计费。
- **出勤来源(教练)**:教练打卡**只产出教学小时**;教练 opHours/leaveHours + freelancer absent 仍手工/另系统。
- **审核粒度**:admin 可**逐条**审,也可**多选勾选批量**审(approve/reject)。
- **覆盖角色**:打卡同时服务**教练**(lesson 模式)与**前台 A1–A3**(shift 模式,无班型)。

### 🟡 新待决(前台带出)— 前台实到工时 → 津贴换算

前台 A1–A3 津贴是「只算 attendance」的**百分比模型**(bracket:met 95–100% / perfect 100%),
分母是「应到工时」。前台打卡只给「实到的几点到几点」。如何换算成津贴?

- **(A)** 维护前台「应到工时 / 排班」,实到 ÷ 应到 → 出勤率 → 现有 bracket(改动小,但需排班来源)。
- **(B)** 前台改「实到工时 × 时薪」计酬(需新增前台时薪,改津贴模型)。
- **(C)** v1 前台打卡只做**记录 + 审核**,实际津贴仍手工算(最窄,但未闭环到发薪)。

**定了这条 → 全部 Open Question 关闭,可进 user-story / 排期 / 开发。**

---

### 下一步(PM)

OQ1 定死后,建议:`user-story` 细化 US1–US5 → `plan-roadmap` 排期 → 再进设计/开发(届时走
brainstorming / TDD,工时聚合逻辑必须单测锁定,毕竟是 payroll)。
