# Clock-in / 教练工时自报系统 — PRD(v1)

> 用 [pm-skills](https://github.com/deanpeters/Product-Manager-Skills) 的 `write-prd`
> / `prd-development` skill 写成。承接 `docs/jtbd-2026-06.md`(第二类用户 + 「打卡系统」一节)。
>
> - 日期:2026-06-13 · 状态:**草案 — 班型↔费率映射已定(§10.已决);次要 OQ(固定/替补、出勤来源、审核粒度)待定**
> - 范围由运营 2026-06-13 的四点回答锁定(见各节标注的 Q1–Q4)

---

## 1. Executive Summary

让 swim 教练成为系统的**直接用户**:每月通过手机**自报**他们教了哪些课(中心、班型、时长),
经 **admin 审核通过**后,自动生成 **Staff Allowance** 和 **Freelancer Payment** 所需的**工时数据**,
顶掉运营每月最烦的手工录工时。**KPI Bonus 不在本期范围**(走另一套学生数据系统,Q3)。

## 2. Problem Statement

- **谁有问题**:运营 / admin(每月手工把每位教练的工时敲进津贴和自由教练计算器);教练(工时靠口头/纸面回报,黑箱,易争议)。
- **问题是什么**:工时是 Allowance(`teachingRows` + `opHours`/`leaveHours`)和 Freelancer(每中心 fixed/replaced 小时)的**核心输入**,目前**全靠手工录入**。
- **为什么痛**:几百人 × 每月,耗时、易错、无审计;教练无自助入口,沟通成本高(JTBD 第一、二类的最痛项)。
- **证据**:`lib/allowance/types.ts`(teaching 按小时计)、`lib/freelancer/calc.ts`(按 fixed/replaced 小时计);HANDOFF 列出「每月手工录工时」与「教练为薪资来回 WhatsApp」。

## 3. Target Users & Personas

- **主 persona — 教练 / 自由教练**(全职 + ~180 自由):手机自报工时,要快、清楚、可查自己的提交状态。
- **主 persona — admin / 主管**:批量审核打卡,approve/reject,要手机友好的审核队列。
- **次 persona — 运营(发薪人)**:在计算器里**一键载入**本月已审核工时,而非手敲。
- **JTBD**:教练「记录我整月教了什么、拿应得的钱、不被少算」;admin「快速核准真实工时,挡住虚报」。

## 4. Strategic Context

- 对上 `ROADMAP` 与 JTBD 的 **P2 战略方向:让教练成为直接用户**。
- 复用现有成熟模式,**低架构风险**:
  - **审核工作流** 复用 Lesson Plan 的 `draft → submitted → approved / changes_requested`(`lib/lesson-plan/access.ts`)。
  - **班型选择 UI** 沿用 assessment / lesson-plan 的选择器(Low/Medium/High 已存在于教案模板)。
  - **能力矩阵**:教练得 `submit_timesheet`(仅见自己,类比 `edit_lesson_plans`);admin/主管得 `review_timesheet`(类比 `review_lesson_plans`)。
  - **审计**:每次 submit/approve/reject 落 `audit_log`。

## 5. Solution Overview

**核心流程**
1. 教练在手机上**新增打卡条目**:日期 · 中心 · **班型(Low / Medium / High / Adult / Young Swimmer / Precomp / Lifesaving,共 7 类)** · 时长(小时) · 〔固定/替补?见 OQ〕 · 备注。
2. 教练**提交**整月 → 状态 `submitted`。
3. admin **审核**:逐条或整月 approve / reject(reject 退回可改重交)。Q4:**必须审核通过才进发薪**。
4. 审核通过的条目按月**聚合**:
   - → **Allowance**:按 `中心` 汇总小时,7 类打卡班型并进现有 3 档 `teachingRows`
     (Low/Med/High/Adult → `normalH`、Young Swimmer → `ysH`、Precomp/Lifesaving → `precompH`);
     出勤小时 → `opHours`/`leaveHours`。**不改现有费率表**。
   - → **Freelancer**:按 `中心` 汇总 fixed/replaced 小时(费率只按职位 × 中心组,与班型无关)。
5. 运营在 Allowance / Freelancer 计算器里**「从打卡载入」**(类比 KPI 的 `?ingest=` 载入),工时预填、可改。

**数据模型(建议)**:新表 `timesheets`(或 `clock_ins`):`coachId, date, center, classType, hours, slotType(fixed|replaced), status, note, reviewedBy, reviewedAt`;状态机同教案;不硬删,审计留痕。

## 6. Success Metrics

- **主指标**:月度工时中**经打卡自动生成**的占比(目标:Allowance + Freelancer 工时 ≥ 90% 来自打卡,取代手敲)。
- 运营每月**手工录工时耗时**下降(现状几小时 → 目标接近 0)。
- 审核**周转时间**(submit → approved 中位数)。
- 自报 vs 审核后工时的**改动率**(衡量自报质量 / 虚报)。

## 7. User Stories & Requirements

- **US1**(教练):作为教练,我能在手机上新增/编辑/删除本月打卡条目,选择中心+班型+时长,并看到提交状态。
  - AC:仅能看/改自己的;`submitted` 后改动退回 `draft`(同教案「改动即回草稿」);班型为固定枚举。
- **US2**(教练):我能一键提交整月待审。
- **US3**(admin):作为 admin,我能看到「待审核」队列,逐条/整月 approve 或 reject 并附理由。
  - AC:仅 `review_timesheet` 可见全部;每次裁决落审计。
- **US4**(运营):在 Allowance/Freelancer 计算器里一键载入某教练某月**已审核**工时。
  - AC:仅聚合 `approved` 条目;载入后仍可手改;未审核的不参与。
- **US5**(系统):同一教练同月重复提交/审核有幂等与并发保护(参照现有 advisory-lock 约定)。

## 8. Out of Scope(v1 明确不做)

- ❌ **喂 KPI Bonus**:KPI 学生进度数据走另一套系统,两边不共享(Q3)。
- ❌ **学生到课记录**:另有学生 attendance 系统(Q1)。
- ❌ **自动缺勤判定**:freelancer 的 absent 标记本期仍按现状处理(除非并入 OQ2)。
- ❌ 排班/课表生成、薪资以外的报表。

## 9. Dependencies & Risks

- **依赖**:能力矩阵新增两项(`submit_timesheet` / `review_timesheet`);审核工作流复用教案模式。(津贴费率表**无需改** — §10 已决)
- **风险与缓解**:
  - *自报虚高* → admin 必审(Q4)+ 审计 + 自报/审核改动率监控。
  - ~~班型↔费率对不上~~ → **已解决**:7 类并进现有 3 档费率,不改费率表,payroll 风险消除。
  - *采纳率低(教练不打卡)* → 手机优先 UX、提交截止提醒;必要时 admin 代录。
  - *固定/替补未捕获(OQ2)* → freelancer attendance bonus 与 replaced 不享 attendance 的规则会算错。

## 10. Open Questions

### ✅ 已决(2026-06-13)— 班型 ↔ 津贴费率映射

打卡班型为 **7 类**,聚合并进现有 **3 档**津贴费率(**不改费率表**):

| 打卡班型 | 津贴费率 bucket |
| --- | --- |
| Low / Medium / High / Adult(learn-to-swim) | `normal` |
| Young Swimmer | `youngSwimmer` |
| **Precomp / Lifesaving**(新增 2 个打卡班型) | `precompLifesaving` |

### 🟡 仍待运营拍板

1. **固定 vs 替补(fixed/replaced)**:打卡是否需逐条标记?Freelancer 计费区分二者(replaced 不享 attendance bonus),不标就算不准。
2. **出勤(opHours/leaveHours)来源**:津贴出勤率从哪来——打卡时长累加即视为出勤,还是单独申报请假小时?
3. **审核粒度**:admin 逐条审 vs 整月一次性审?(影响 UX 与周转)

---

### 下一步(PM)

OQ1 定死后,建议:`user-story` 细化 US1–US5 → `plan-roadmap` 排期 → 再进设计/开发(届时走
brainstorming / TDD,工时聚合逻辑必须单测锁定,毕竟是 payroll)。
