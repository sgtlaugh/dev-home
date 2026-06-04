# Activity Timeline Enhancements

## Context
Activity and Peer Activity tabs now have card layout, accent bars, avatars, expand animation. Next: add summary stats, action filters, actor filters, and expand/collapse-all to handle 30 days of data.

## Plan

### 1. Summary stats bar
Top of timeline, row of stat chips: `● 5 Approvals · ● 12 Comments · ● 3 Commits` etc. Each chip has a colored dot matching the action's accent color. Computed from `activities` array by counting action types.

- Add to `ActivityTimeline.tsx` above the date groups
- Use `useMemo` to compute counts by action category
- Categories: Approved, Commented, Committed, Created PR, Merged PR, Requested changes, Created ticket (group by prefix)
- Render as a flex row of small styled spans with colored dots
- CSS class `activity-stats-bar` in `index.css`

### 2. Action type filter chips
Below stats bar, row of clickable pills per action type. Click toggles filter on/off. Multiple can be active (intersection). When none selected = show all.

- Add `activeFilters: Set<string>` state to `ActivityTimeline`
- Filter chips derived from same action categories as stats
- When filters active, filter `activities` before passing to `groupActivitiesByDate`
- Styled as small pills with colored left border, dim when inactive, bright when active
- CSS class `activity-filter-chip` / `activity-filter-chip.active`

### 3. Actor filter chips (peer activity only)
Show when `currentUsername` is set. Row of unique actor avatars above the timeline. Click one to filter to that actor's activity. Click again to deselect.

- Add `activeActor: string | null` state
- Extract unique actors from all activities (dedupe by login)
- Render as row of circular avatar buttons, selected one gets bright border
- Filter activities by `metadata.actor.login === activeActor` when set
- Works in combination with action type filters

### 4. Expand/collapse all per date group
Small toggle button in date label row. Click expands all items in that group, click again collapses all.

- Add a "toggle all" icon button next to date label pill
- On click, add/remove all entityKeys in that group to `expandedEntities`
- Use `IconChevronsDown` / `IconChevronsUp` from tabler icons
- Small, subtle — same size as the pill badge

## Files to modify
- `src/components/ActivityTimeline.tsx` — all 4 features
- `src/index.css` — stats bar, filter chips, actor chips styles + light theme

## Verification
- Build passes
- Activity tab: stats bar shows counts, filter chips toggle, expand-all works
- Peer Activity tab: actor chips appear, filtering works with action filters
- Light theme renders correctly
