import React, { useState } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import {
  IconSubtask,
  IconAt,
  IconGitPullRequest,
  IconEye,
  IconNote,
  IconCheck,
  IconPlus,
} from "@tabler/icons-react";
import { JiraIssue, JiraComment, GitHubPR, Note } from "../types";
import { getReferenceUrl, getNoteDisplayTitle } from "../utils/text";
import { DescriptionModal } from "./DescriptionModal";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { Timestamp } from "./Timestamp";
import { StatusBadge } from "./StatusBadge";

interface SummaryViewProps {
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  loading: boolean;
  jiraIssuesLoading?: boolean;
  jiraCommentsLoading?: boolean;
  openPRsLoading?: boolean;
  reviewRequestsLoading?: boolean;
  notesLoading?: boolean;
  jiraBaseUrl: string;
  onNavigate: (tab: string) => void;
  notes: Note[];
  onResolveNote: (id: number) => Promise<void>;
  onAddNote: () => void;
  onOpenNote: (note: Note) => void;
}

const SECTION_COLORS: Record<string, string> = {
  prs: "#1a7f37",
  reviews: "#8250df",
  jira: "#0969da",
  notifications: "#e3795c",
  notes: "#0d9488",
};

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
  accent: string;
  onSeeMore?: () => void;
  headerAction?: React.ReactNode;
  loading?: boolean;
  tooltip?: string;
}

function Section({
  icon,
  title,
  count,
  children,
  accent,
  onSeeMore,
  headerAction,
  loading,
  tooltip,
}: SectionProps) {
  return (
    <Card className="h-100 summary-card" style={{ borderLeft: `3px solid ${accent}` }}>
      <Card.Body className="p-0">
        <div className="section-header px-3 pt-3 mb-0" title={tooltip}>
          <span
            className="section-icon-bg"
            style={{ backgroundColor: `${accent}15`, color: accent }}
          >
            {icon}
          </span>
          <span>{title}</span>
          {count > 0 && (
            <Badge bg="" className="badge-status-neutral" style={{ fontSize: "0.625rem" }}>
              {count}
            </Badge>
          )}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {loading && (
              <Spinner
                animation="border"
                size="sm"
                variant="secondary"
                style={{ width: 12, height: 12, borderWidth: 1.5 }}
              />
            )}
            {headerAction}
          </span>
        </div>
        <div style={{ marginTop: 8 }}>{children}</div>
        {onSeeMore && (
          <div className="see-more-row px-3 py-2">
            <button className="see-more-btn" onClick={onSeeMore}>
              See more
            </button>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

interface ItemRowProps {
  url: string;
  title: string;
  subtitle: string;
  time: string;
  badge?: string | React.ReactNode;
  badgeClass?: string;
  checksStatus?: string | null;
  onClick?: () => void;
  hideTime?: boolean;
}

function ItemRow({
  url,
  title,
  subtitle,
  time,
  badge,
  badgeClass,
  checksStatus,
  onClick,
  hideTime,
}: ItemRowProps) {
  return (
    <div className="summary-item d-flex align-items-center gap-3 px-3 py-2" onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-truncate-custom d-block"
          style={{ fontWeight: 500, fontSize: "0.8125rem" }}
          onClick={(e) => e.stopPropagation()}
        >
          {title}
        </a>
        <div
          className="text-secondary-custom text-truncate-custom"
          style={{ fontSize: "0.75rem", marginTop: 1 }}
        >
          {subtitle}
        </div>
      </div>
      <div
        className="d-flex align-items-center gap-2"
        style={
          hideTime && badge
            ? { flexShrink: 0 }
            : badge
              ? { width: "140px", flexShrink: 0 }
              : { flexShrink: 0 }
        }
      >
        {!hideTime && (
          <div style={badge ? { width: "60px" } : {}}>
            <Timestamp timestamp={time} />
          </div>
        )}
        {badge && typeof badge === "string" ? (
          <Badge
            bg=""
            className={badgeClass || "badge-status-neutral"}
            style={hideTime ? {} : { flex: 1, textAlign: "center" }}
          >
            {badge}
          </Badge>
        ) : badge ? (
          badge
        ) : null}
        {checksStatus !== undefined && <ChecksStatusIcon status={checksStatus} />}
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="text-secondary-custom px-3 py-3" style={{ fontSize: "0.8125rem" }}>
      {text}
    </div>
  );
}

function HeroStats({
  prCount,
  reviewCount,
  jiraCount,
  notifCount,
  noteCount,
  onNavigate,
}: {
  prCount: number;
  reviewCount: number;
  jiraCount: number;
  notifCount: number;
  noteCount: number;
  onNavigate: (tab: string) => void;
}) {
  const stats = [
    {
      label: "Open PRs",
      count: prCount,
      color: SECTION_COLORS.prs,
      tab: "prs",
      tooltip: "Pull requests awaiting merge",
    },
    {
      label: "Reviews",
      count: reviewCount,
      color: SECTION_COLORS.reviews,
      tab: "reviews",
      tooltip: "Pull requests awaiting your review",
    },
    {
      label: "JIRA Tasks",
      count: jiraCount,
      color: SECTION_COLORS.jira,
      tab: "jira",
      tooltip: "Issues updated in the last 30 days",
    },
    {
      label: "Notifications",
      count: notifCount,
      color: SECTION_COLORS.notifications,
      tab: "mentions",
      tooltip: "Comments where you were mentioned",
    },
    {
      label: "Notes",
      count: noteCount,
      color: SECTION_COLORS.notes,
      tab: "notes",
      tooltip: "Personal notes and reminders",
    },
  ];

  return (
    <div className="summary-hero-bar">
      {stats.map((s) => (
        <div
          key={s.label}
          className="summary-hero-stat"
          onClick={() => onNavigate(s.tab)}
          title={s.tooltip}
        >
          <div className="summary-hero-count" style={{ color: s.color }}>
            {s.count}
          </div>
          <div className="summary-hero-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  jiraIssues,
  jiraComments,
  openPRs,
  reviewRequests,
  loading,
  jiraIssuesLoading,
  jiraCommentsLoading,
  openPRsLoading,
  reviewRequestsLoading,
  notesLoading,
  jiraBaseUrl,
  onNavigate,
  notes,
  onResolveNote,
  onAddNote,
  onOpenNote,
}) => {
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);

  if (loading && jiraIssues.length === 0 && openPRs.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  const jiraBase = jiraBaseUrl?.replace(/\/+$/, "") || "";

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const issuesThisMonth = jiraIssues.filter((issue) => new Date(issue.updated) >= thirtyDaysAgo);

  const topReviews = [...reviewRequests]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);
  const topPRs = [...openPRs]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);
  const topIssues = [...issuesThisMonth]
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
    .slice(0, 5);
  const topNotes = [...notes]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  // JIRA mentions, sort by date, take 5
  const allMentions = jiraComments
    .map((c) => ({
      id: `jc-${c.id}`,
      title: `${c.author.displayName} on ${c.issueKey}`,
      subtitle: c.issueSummary,
      url: jiraBase ? `${jiraBase}/browse/${c.issueKey}` : `#${c.issueKey}`,
      time: c.created,
    }))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);

  return (
    <>
      <HeroStats
        prCount={openPRs.length}
        reviewCount={reviewRequests.length}
        jiraCount={issuesThisMonth.length}
        notifCount={jiraComments.length}
        noteCount={notes.length}
        onNavigate={onNavigate}
      />

      <Row className="g-3">
        <Col md="9" className="d-flex flex-column">
          <Row className="g-2 flex-grow-1">
            <Col md={6}>
              <Section
                icon={<IconGitPullRequest size={13} stroke={1.8} />}
                title="Open Pull Requests"
                count={openPRs.length}
                accent={SECTION_COLORS.prs}
                onSeeMore={openPRs.length > 5 ? () => onNavigate("prs") : undefined}
                loading={openPRsLoading}
                tooltip="Pull requests awaiting merge"
              >
                {topPRs.length > 0 ? (
                  topPRs.map((pr) => (
                    <ItemRow
                      key={pr.id}
                      url={pr.html_url}
                      title={`#${pr.number} ${pr.title}`}
                      subtitle={pr.repo_full_name}
                      time={pr.updated_at}
                      badge={pr.draft ? "Draft" : "Open"}
                      badgeClass={pr.draft ? "badge-status-neutral" : "badge-status-green"}
                      checksStatus={pr.checks_status}
                      onClick={() => setSelectedPR(pr)}
                    />
                  ))
                ) : (
                  <EmptyRow text="No open pull requests" />
                )}
              </Section>
            </Col>
            <Col md={6}>
              <Section
                icon={<IconSubtask size={13} stroke={1.8} />}
                title="JIRA Tasks"
                count={issuesThisMonth.length}
                accent={SECTION_COLORS.jira}
                onSeeMore={issuesThisMonth.length > 5 ? () => onNavigate("jira") : undefined}
                loading={jiraIssuesLoading}
                tooltip="Issues updated in the last 30 days"
              >
                {topIssues.length > 0 ? (
                  topIssues.map((issue) => (
                    <ItemRow
                      key={issue.key}
                      url={jiraBase ? `${jiraBase}/browse/${issue.key}` : `#${issue.key}`}
                      title={`${issue.key}: ${issue.summary}`}
                      subtitle={issue.project.name}
                      time={issue.updated}
                      badge={
                        <StatusBadge
                          statusName={issue.status.name}
                          colorName={issue.status.statusCategory.colorName}
                        />
                      }
                      onClick={() => setSelectedIssue(issue)}
                      hideTime={true}
                    />
                  ))
                ) : (
                  <EmptyRow text="No assigned issues" />
                )}
              </Section>
            </Col>

            {/* Row 2 */}
            <Col md={6}>
              <Section
                icon={<IconEye size={13} stroke={1.8} />}
                title="Review Requests"
                count={reviewRequests.length}
                accent={SECTION_COLORS.reviews}
                onSeeMore={reviewRequests.length > 5 ? () => onNavigate("reviews") : undefined}
                loading={reviewRequestsLoading}
                tooltip="Pull requests awaiting your review"
              >
                {topReviews.length > 0 ? (
                  topReviews.map((r) => (
                    <ItemRow
                      key={r.id}
                      url={r.html_url}
                      title={`#${r.number} ${r.title}`}
                      subtitle={`${r.repo_full_name} · ${r.user.login}`}
                      time={r.updated_at}
                      badgeClass="badge-status-yellow"
                      checksStatus={r.checks_status}
                      onClick={() => setSelectedPR(r)}
                    />
                  ))
                ) : (
                  <EmptyRow text="No pending reviews" />
                )}
              </Section>
            </Col>
            <Col md={6}>
              <Section
                icon={<IconAt size={13} stroke={1.8} />}
                title="JIRA Notifications"
                count={jiraComments.length}
                accent={SECTION_COLORS.notifications}
                onSeeMore={jiraComments.length > 5 ? () => onNavigate("mentions") : undefined}
                loading={jiraCommentsLoading}
                tooltip="Comments where you were mentioned"
              >
                {allMentions.length > 0 ? (
                  allMentions.map((m) => (
                    <ItemRow
                      key={m.id}
                      url={m.url}
                      title={m.title}
                      subtitle={m.subtitle}
                      time={m.time}
                    />
                  ))
                ) : (
                  <EmptyRow text="No recent mentions" />
                )}
              </Section>
            </Col>
          </Row>
        </Col>
        <Col md="3">
          <Section
            icon={<IconNote size={13} stroke={1.8} />}
            title="Notes"
            count={notes.length}
            accent={SECTION_COLORS.notes}
            onSeeMore={notes.length > 10 ? () => onNavigate("notes") : undefined}
            loading={notesLoading}
            tooltip="Personal notes and reminders"
            headerAction={
              <Button
                variant="outline-secondary"
                size="sm"
                style={{ padding: "1px 5px", lineHeight: 1 }}
                title="Add note"
                onClick={onAddNote}
              >
                <IconPlus size={12} />
              </Button>
            }
          >
            {topNotes.length > 0 ? (
              <div className="summary-notes-grid">
                {topNotes.map((note) => (
                  <div
                    key={note.id}
                    className="summary-note-chip"
                    onClick={() => onOpenNote(note)}
                    title={getNoteDisplayTitle(note)}
                  >
                    <span className="summary-note-chip-text">{getNoteDisplayTitle(note)}</span>
                    <button
                      className="summary-note-resolve"
                      onClick={(e) => {
                        e.stopPropagation();
                        onResolveNote(note.id);
                      }}
                      title="Resolve"
                    >
                      <IconCheck size={10} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRow text="No notes" />
            )}
          </Section>
        </Col>
      </Row>

      <DescriptionModal
        show={!!selectedIssue}
        onHide={() => setSelectedIssue(null)}
        title={selectedIssue ? `${selectedIssue.key}: ${selectedIssue.summary}` : ""}
        subtitle={selectedIssue?.project.name}
        description={selectedIssue?.description || ""}
        url={selectedIssue && jiraBase ? `${jiraBase}/browse/${selectedIssue.key}` : undefined}
      />

      <DescriptionModal
        show={!!selectedPR}
        onHide={() => setSelectedPR(null)}
        title={selectedPR ? `#${selectedPR.number} ${selectedPR.title}` : ""}
        subtitle={selectedPR?.repo_full_name}
        description={selectedPR?.body || ""}
        url={selectedPR?.html_url}
        checks={selectedPR?.checks}
      />
    </>
  );
};
