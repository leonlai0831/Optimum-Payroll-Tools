# Clock-in / 教练工时自报系统 — PRD(v1)

> 用 [pm-skills](https://github.com/deanpeters/Product-Manager-Skills) 的 `write-prd`
> / `prd-development` skill 写成。承接 `docs/jtbd-2026-06.md`(第二类用户 + 「打卡系统」一节)。
>
> - 日期:2026-06-13 · 状态:**Open Questions 全部已决 — 可进 user-story / 排期 / 开发(残留实现细节:freelancer 固定班表的录入与维护)。注:全职前台暂不打卡,移出 v1。**
> - 范围由运营 2026-06-13 的四点回答锁定(见各节标注的 Q1–Q4)

---

## 1. Executive Summary

让 swim **教练(全职 + 自由)+ 自由前台**成为系统的**直接用户**:每月通过手机**自报工时** ——
教练按课(中心 + 班型 + 时长),前台按班次(几点到几点,**无班型**)—— 经 **admin 审核通过**后,
自动生成 **Staff Allowance** 和 **Freelancer Payment** 所需的**工时数据**,顶掉运营每月最烦的手工录工时。
**全职前台暂不打卡(移出 v1,津贴维持现状)**;**KPI Bonus 不在本期范围**(走另一套学生数据系统,Q3)。

## 2. Problem Statement

- **谁有问题**:运营 / admin(每月手工把每位教练的工时敲进津贴和自由教练计算器);教练(工时靠口头/纸面回报,黑箱,易争议)。
- **问题是什么**:工时是 Allowance(`teachingRows` + `opHours`/`leaveHours`)和 Freelancer(每中心 fixed/replaced 小时)的**核心输入**,目前**全靠手工录入**。
- **为什么痛**:几百人 × 每月,耗时、易错、无审计;教练无自助入口,沟通成本高(JTBD 第一、二类的最痛项)。
- **证据**:`lib/allowance/types.ts`(teaching 按小时计)、`lib/freelancer/calc.ts`(按 fixed/replaced 小时计);HANDOFF 列出「每月手工录工时」与「教练为薪资来回 WhatsApp」。

## 3. Target Users & Personas

打卡的**录入模式**按角色分(教练 = lesson / 前台 = shift);**计费口径**按雇佣类型分(全职 / 自由):

- **全职教练**:按课自报(中心 + 班型 + 时长)→ 喂津贴 teaching 工时。
- **自由教练 / 自由前台**(~180):打卡(教练按课 / 前台按班次)+ 一份**维护好的固定班表**;
  班表是 **fixed / 替补 / 缺勤 与 attendance bonus 的自动判定依据**(§5)。
- **全职前台**(A1–A3):**v1 不打卡**(暂缓),津贴维持现状手工;未来再纳入(§10 已记方案)。
- **admin / 主管**:逐条 / 批量审核打卡 + **维护自由人员的固定班表**;手机友好。
- **运营(发薪人)**:在计算器里**一键载入**本月已审核工时,而非手敲。
- **JTBD**:员工「记录我整月做了什么、拿应得的钱、不被少算」;admin「快速核准真实工时,挡住虚报」。
- **Roster 范围**:打卡覆盖**全职教练 + 全部 freelancer(含自由前台)**;**全职前台暂不纳入**;固定班表维护仅 freelancer;均不同于 Assessment(只 instructor)。

## 4. Strategic Context

- 对上 `ROADMAP` 与 JTBD 的 **P2 战略方向:让教练 + 自由前台成为直接用户**(全职前台暂缓)。
- 复用现有成熟模式,**低架构风险**:
  - **审核工作流** 复用 Lesson Plan 的 `draft → submitted → approved / changes_requested`(`lib/lesson-plan/access.ts`)。
  - **班型选择 UI** 沿用 assessment / lesson-plan 的选择器(Low/Medium/High 已存在于教案模板)。
  - **能力矩阵**:员工得 `submit_timesheet`(仅见自己,类比 `edit_lesson_plans`);admin/主管得 `review_timesheet`(类比 `review_lesson_plans`)+ `manage_freelancer_schedule`(维护固定班表)。
  - **审计**:每次 submit/approve/reject 落 `audit_log`。

## 5. Solution Overview

**核心流程**
0. **(自由人员)维护固定班表**:admin 为每个 freelancer 维护一份**固定班表**(周期性 slot:星期 / 时段 / 中心 / 〔教练:班型〕)。这是 fixed 工时与 attendance 的基准。
1. **新增打卡条目(两种模式,按角色)**:
   - **教练(lesson 模式)**:日期 · 中心 · **班型(7 类:Low/Medium/High/Adult/Young Swimmer/Precomp/Lifesaving)** · 时长(小时) · 备注。**fixed/替补不手填**(freelancer 由班表自动判;全职不区分)。
   - **自由前台(shift 模式)**:日期 · 中心 · **班次起讫(几点到几点 → 自动算工时)** · 备注。**无班型**。(全职前台 v1 不打卡)
2. 教练**提交**整月 → 状态 `submitted`。
3. admin **审核**:可**逐条**、也可**多选勾选批量** approve / reject(reject 退回可改重交)。**必须审核通过才进发薪**(Q4)。
4. 审核通过的条目按月**聚合**:
   - → **Allowance**:按 `中心` 汇总教学小时,7 类班型并进现有 3 档 `teachingRows`
     (Low/Med/High/Adult → `normalH`、Young Swimmer → `ysH`、Precomp/Lifesaving → `precompH`)。
     **出勤部分(`opHours`/`leaveHours`)v1 不由打卡产生**(仍手工/另系统)。**不改费率表**。
   - → **Freelancer**(对照固定班表自动判定):每条已审核打卡 vs 班表 → **在班表 = fixed**、**不在 = 替补(replaced)**;**班表上有 slot 却无打卡 = 缺勤**。按 `中心 + fixed/替补` 汇总小时;**attendance bonus 自动判定**(有缺勤即不享,只对 fixed 小时),**取代手工 `absent` 标记**。费率只按职位 × 中心组,与班型无关。
   - (自由前台的 `shift` 工时同样走上面的 **Freelancer** 对账 → fixed/替补/缺勤;**全职前台 v1 不接打卡**,attendance 津贴维持现状手工,方案见 §10 暂缓。)
5. 运营在 Allowance / Freelancer 计算器里**「从打卡载入」**(类比 KPI 的 `?ingest=` 载入),工时预填、可改。

**数据模型(建议)**:
- 新表 `timesheets`:`coachId, date, center, entryType('lesson'|'shift'), classType?, startTime?, endTime?, hours, slotType?(fixed|replaced — freelancer 由班表派生、admin 可覆盖), status, note, reviewedBy, reviewedAt`。教练 = `lesson`;前台 = `shift`(hours 由起讫推导)。
- 新表 `freelancer_schedules`(固定班表,仅 freelancer):`coachId, weekday, startTime, endTime, center, classType?, effectiveFrom, effectiveTo?`。按月展开后与 `timesheets` 对账 → 派生 fixed/替补/缺勤。
- 状态机同教案;均不硬删,审计留痕。

## 6. Success Metrics

- **主指标**:月度工时中**经打卡自动生成**的占比(目标:Allowance + Freelancer 工时 ≥ 90% 来自打卡,取代手敲)。
- 运营每月**手工录工时耗时**下降(现状几小时 → 目标接近 0)。
- 审核**周转时间**(submit → approved 中位数)。
- 自报 vs 审核后工时的**改动率**(衡量自报质量 / 虚报)。

## 7. User Stories & Requirements

- **US1**(教练):作为教练,我能在手机上新增/编辑/删除本月打卡条目(中心 + 班型 + 时长),并看到提交状态。
  - AC:仅能看/改自己的;`submitted` 后改动退回 `draft`(同教案);班型为 7 类固定枚举;**fixed/替补不手填**。
- **US2**(教练):我能一键提交整月待审。
- **US3**(admin):作为 admin,我能看到「待审核」队列,**逐条或多选勾选批量** approve / reject 并附理由。
  - AC:仅 `review_timesheet` 可见全部;支持单条与批量两种操作;每次裁决落审计。
- **US4**(运营):在 Allowance/Freelancer 计算器里一键载入某教练某月**已审核**工时。
  - AC:仅聚合 `approved` 条目;载入后仍可手改;未审核的不参与。
- **US5**(系统):同一员工同月重复提交/审核有幂等与并发保护(参照现有 advisory-lock 约定)。
- **US6**(自由前台):作为自由前台,我能在手机上按班次记录「日期 + 中心 + 几点到几点」,**无需选班型**,提交待审。
  - AC:`shift` 模式;工时由起讫自动算;审核流/自审计/改动回草稿等同 US1。**全职前台 v1 不打卡**。
- **US7**(admin):作为 admin,我能为每个 freelancer 维护固定班表(周期性 slot:星期 / 时段 / 中心 / 〔班型〕),含生效起讫。
  - AC:`manage_freelancer_schedule`;改动落审计;仅 freelancer。
- **US8**(系统):月底把 freelancer 的已审核打卡**对照固定班表**自动判定每条 fixed/替补、标出缺勤,并据此**自动决定 attendance bonus 是否享**;admin 可覆盖个别判定。
  - AC:对账与 attendance 判定逻辑**单测锁定**(payroll);覆盖留审计。

## 8. Out of Scope(v1 明确不做)

- ❌ **喂 KPI Bonus**:KPI 学生进度数据走另一套系统,两边不共享(Q3)。
- ❌ **学生到课记录**:另有学生 attendance 系统(Q1)。
- ❌ **全职前台打卡**:**v1 暂缓**;全职前台津贴(attendance 实到 ÷ 应到)维持现状手工。方案已记 §10,未来纳入。
- ⚠️ **全职教练津贴出勤(opHours/leaveHours)**:v1 不由打卡产生,仍手工/另系统(已决)。
- ✅ **freelancer absent**:**改为自动**(打卡 vs 固定班表派生),不再手工标。
- ❌ **排班/课表生成**:v1 不做逐日排班;唯一例外是 **freelancer 固定班表**(在范围内,是 fixed/替补/attendance 的判定依据)。
- ❌ 薪资以外的报表。

## 9. Dependencies & Risks

- **依赖**:能力矩阵新增三项(`submit_timesheet` / `review_timesheet` / `manage_freelancer_schedule`);审核工作流复用教案模式;**freelancer 固定班表须先维护好**才能算准对账。(津贴费率表无需改 — §10)
- **风险与缓解**:
  - *自报虚高* → admin 必审(Q4)+ 审计 + 自报/审核改动率监控。
  - ~~班型↔费率对不上~~ → **已解决**:7 类并进现有 3 档费率,不改费率表,payroll 风险消除。
  - *采纳率低(员工不打卡)* → 手机优先 UX、提交截止提醒;必要时 admin 代录。
  - ~~固定/替补未捕获~~ → **已解决**:freelancer 由**固定班表自动判定** fixed/替补/缺勤 + attendance bonus(§5/§10),取代手工标。
  - *班表对账算错 attendance bonus(**payroll 级**)* → 对账 + attendance 判定逻辑 **TDD 单测锁死**;admin 可覆盖 + 审计。
  - *班表没维护 / 过期* → freelancer 全被判替补/缺勤 → 算错;**上线前须先录入现有 freelancer 班表**(类比 payee 导入的一次性数据准备)。
  - *全职前台打卡* → **移出 v1**(暂缓);其津贴维持现状手工,方案已记 §10 待未来。

## 10. Open Questions

### ✅ 已决(2026-06-13)— 班型 ↔ 津贴费率映射

打卡班型为 **7 类**,聚合并进现有 **3 档**津贴费率(**不改费率表**):

| 打卡班型 | 津贴费率 bucket |
| --- | --- |
| Low / Medium / High / Adult(learn-to-swim) | `normal` |
| Young Swimmer | `youngSwimmer` |
| **Precomp / Lifesaving**(新增 2 个打卡班型) | `precompLifesaving` |

### ✅ 已决(2026-06-13)— 其余

- **固定 vs 替补 + 缺勤 + attendance bonus(freelancer)**:由**固定班表自动判定**(打卡 vs 班表),不手填;admin 可覆盖;**和全职不一样**(全职不区分 fixed/替补)。
- **出勤来源(教练)**:教练打卡**只产出教学小时**;教练 opHours/leaveHours + freelancer absent 仍手工/另系统。
- **审核粒度**:admin 可**逐条**审,也可**多选勾选批量**审(approve/reject)。
- **覆盖角色**:打卡服务**全职教练 + 全部 freelancer**(自由前台走 shift 模式);**全职前台暂缓**。

### ⏸️ 暂缓(不在 v1)— 全职前台实到工时 → 津贴换算

**全职前台 v1 不打卡**,本方案**留作未来**:实到工时 ÷ 应到工时 → 出勤率 → 现有 met/perfect bracket
(沿用已验证的津贴引擎,不改模型);「应到工时」用可配置的月度标准值。届时再启用。

### ✅ 已决(2026-06-13)— Freelancer 固定班表

freelancer(教练 + 前台)维护**固定班表**;它作为**校验器**:打卡 vs 班表 →
**在班表 = fixed**、**不在 = 替补**、**班表有 slot 却无打卡 = 缺勤**。据此**自动判定 freelancer 的
attendance bonus**(有缺勤即不享 fixed 小时的 attendance bonus)—— **和 full-time 的百分比模型不同**。
admin 可覆盖个别判定。⚠️ 上线前须先录入现有 freelancer 班表(一次性数据准备)。

**全部 Open Question 关闭 → 可进 user-story / 排期 / 开发。**

---

### 下一步(PM)

建议:`user-story` 细化 US1–US8 → `plan-roadmap` 排期 → 再进设计/开发(届时走
brainstorming / TDD;工时聚合 + 班表对账逻辑必须单测锁定,毕竟是 payroll)。
