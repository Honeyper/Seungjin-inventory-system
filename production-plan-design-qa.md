# Production Plan Design QA

- Source visual truth (table): `/Users/kang-kyoungmo/.codex/generated_images/01a056d5-8b6f-7e50-8815-afcbd5139948/exec-8eff38d3-47eb-4d72-8803-01054a06e4a2.png`
- Source visual truth (machine board): `/Users/kang-kyoungmo/.codex/generated_images/01a056d5-8b6f-7e50-8815-afcbd5139948/exec-a4c579bb-1236-45b8-83e9-17117e123c51.png`
- Implementation capture: Codex in-app browser at `http://localhost:4173/design-preview-production-plan.html`
- Table comparison evidence: `/Users/kang-kyoungmo/.codex/generated_images/01a056d5-8b6f-7e50-8815-afcbd5139948/exec-cbecb9cc-fb6e-4777-a73e-3d19258eb8b9.png`
- Board comparison evidence: `/Users/kang-kyoungmo/.codex/generated_images/01a056d5-8b6f-7e50-8815-afcbd5139948/exec-7a66665f-6e3a-4812-bc08-f369f190e5f7.png`
- Viewport: 1488 × 1032 CSS px, device scale factor 1
- Source dimensions: 1487 × 1058 px for both selected targets
- Comparison normalization: source and implementation were placed at equal visual width in each side-by-side comparison board; browser chrome and external canvas were excluded.
- State: 작업관리 > 생산계획, 1공장, 2026-09-10. Table and machine-board tab states were captured separately.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: Noto Sans KR, compact weights, hierarchy, line height, and long-name wrapping match the existing administrator product and remain readable at the target desktop viewport.
- Spacing and layout rhythm: the two-level page structure, toolbar, summary strip, tabs, grouped rows, and machine lanes retain the selected concepts while using the product's existing compact PC spacing and radii.
- Colors and visual tokens: the implementation consistently uses the existing navy, gold, gray, border, urgent, and selected-state tokens instead of the spreadsheet's yellow fill or the concept board's alternate dark sidebar.
- Image quality and asset fidelity: this workflow contains no photographic or illustrative assets. Existing brand assets and the installed Tabler icon font are reused; no placeholder art, emoji, or handcrafted SVG was introduced.
- Copy and content: all requested columns are present, the two tabs are named `생산계획표` and `기계별 스케줄`, and production-specific labels use current Korean operational terminology.
- The board intentionally omits the concept's drag-and-drop backlog rail in this iteration. Unassigned work is still surfaced in the summary/status, while editing remains centralized in the production-plan table. This matches the requested two-tab scope and is not a visual defect.

## Full-view comparison evidence

- The table comparison shows the same dominant hierarchy as the selected table concept: compact header controls, summary metrics, grouped process rows, urgent due-date treatment, and a dense full-width plan table.
- The board comparison shows the same machine-lane and 08:00–18:00 timeline relationship as the selected board concept, adapted to the current application's white sidebar and navy/gold system.

## Focused region comparison evidence

- Focused review covered the final `특이사항` column, process row groups, editable target/worker/time controls, timeline labels, task-bar length, urgent colors, and sidebar active state.
- The final table wrapper measured `clientWidth: 1294` and `scrollWidth: 1294`, confirming that the ten columns fit without hidden horizontal overflow at the target viewport.

## Interaction and console checks

- `생산계획표` → `기계별 스케줄` tab transition was clicked and the intended tab panel became visible.
- Date/factory controls, purchase-order sync, automatic planning, editable fields, save, and print are bound in the production implementation.
- Browser console warnings/errors checked: none.
- Automated regression suite: 170 tests passed.

## Comparison history

1. Initial table capture found a P2 horizontal overflow at the final `특이사항` column caused by fixed column widths.
2. Column widths were changed to a 100% proportional layout and the minimum table width was reduced from 86rem to 80rem.
3. Post-fix capture confirmed equal client and scroll widths at 1294px and full visibility of every column.

## Follow-up polish

- P3: a later scheduling iteration can add drag-and-drop ordering and overlap warnings after shared server persistence and worker master data are defined.

final result: passed
