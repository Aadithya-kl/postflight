import type {
  CompilationBundle,
  ContrastResult,
  DuplicateCollision,
  FfmpegCommandResult,
  FoldPreview,
  KillSwitchState,
  LintDiagnostic,
  OAuthTokenHealth,
  PlatformLintReport,
  PlatformSpec,
  PreFlightReport,
  SafeZoneAnalysis,
  Severity,
  TriagedComment,
  UtmAuditResult,
} from '@postflight/core';

export interface AnsiPalette {
  enabled: boolean;
  reset: (text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
  italic: (text: string) => string;
  underline: (text: string) => string;
  red: (text: string) => string;
  green: (text: string) => string;
  yellow: (text: string) => string;
  blue: (text: string) => string;
  magenta: (text: string) => string;
  cyan: (text: string) => string;
  white: (text: string) => string;
  gray: (text: string) => string;
  bgRed: (text: string) => string;
  bgGreen: (text: string) => string;
  bgYellow: (text: string) => string;
  bgCyan: (text: string) => string;
}

export function shouldUseColor(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
    return false;
  }
  if (process.env.FORCE_COLOR === '0' || process.env.FORCE_COLOR === 'false') {
    return false;
  }
  if (process.env.FORCE_COLOR === '1' || process.env.FORCE_COLOR === 'true') {
    return true;
  }
  return Boolean(process.stdout.isTTY);
}

export function createAnsi(enabled: boolean = shouldUseColor()): AnsiPalette {
  const wrap = (open: string, close: string) => (text: string): string =>
    enabled ? `\u001b[${open}m${text}\u001b[${close}m` : text;

  return {
    enabled,
    reset: wrap('0', '0'),
    bold: wrap('1', '22'),
    dim: wrap('2', '22'),
    italic: wrap('3', '23'),
    underline: wrap('4', '24'),
    red: wrap('31', '39'),
    green: wrap('32', '39'),
    yellow: wrap('33', '39'),
    blue: wrap('34', '39'),
    magenta: wrap('35', '39'),
    cyan: wrap('36', '39'),
    white: wrap('37', '39'),
    gray: wrap('90', '39'),
    bgRed: wrap('41;37;1', '0'),
    bgGreen: wrap('42;30;1', '0'),
    bgYellow: wrap('43;30;1', '0'),
    bgCyan: wrap('46;30;1', '0'),
  };
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function colorGrade(grade: PreFlightReport['overallGrade'], c: AnsiPalette): string {
  const badge = ` ${grade} `;
  switch (grade) {
    case 'A+':
    case 'A':
      return c.bgGreen(badge);
    case 'B':
      return c.bgCyan(badge);
    case 'C':
      return c.bgYellow(badge);
    case 'D':
    case 'F':
      return c.bgRed(badge);
  }
}

function colorScore(score: number, c: AnsiPalette): string {
  const label = `${score}/100`;
  if (score >= 90) return c.bold(c.green(label));
  if (score >= 75) return c.bold(c.cyan(label));
  if (score >= 60) return c.bold(c.yellow(label));
  return c.bold(c.red(label));
}

function renderMeter(current: number, limit: number, width: number, c: AnsiPalette): string {
  const ratio = limit > 0 ? current / limit : 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  const empty = Math.max(0, width - filled);
  const bar = `${'#'.repeat(filled)}${'-'.repeat(empty)}`;

  if (current > limit) {
    return `[${c.red(bar)}]`;
  }
  if (ratio >= 0.85) {
    return `[${c.yellow(bar)}]`;
  }
  return `[${c.green(bar)}]`;
}

function formatSeverityTag(severity: Severity, c: AnsiPalette): string {
  switch (severity) {
    case 'error':
      return c.bold(c.red('ERROR'));
    case 'warning':
      return c.bold(c.yellow('WARN '));
    case 'info':
      return c.bold(c.cyan('INFO '));
  }
}

function indentBlock(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function formatFoldSnippet(fold: FoldPreview, c: AnsiPalette): string {
  const surface = fold.surface === 'mobile' ? 'Mobile ' : 'Desktop';
  const limitParts: string[] = [];
  if (fold.charLimit !== null) limitParts.push(`${fold.charLimit}ch`);
  if (fold.lineLimit !== null) limitParts.push(`${fold.lineLimit}L`);
  const limitSummary = limitParts.length > 0 ? limitParts.join(' / ') : 'no fold';

  const status = fold.truncated
    ? c.yellow(`TRUNCATED (${fold.reason})`)
    : c.green('FULL VISIBLE');

  const compactPreview = fold.visibleText
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, ' ↵ ')
    .trim();

  const truncatedPreview =
    compactPreview.length > 110
      ? `${compactPreview.slice(0, 107)}...`
      : compactPreview;

  const foldSuffix = fold.truncated ? ` ${c.dim(fold.foldLabel)}` : '';
  const blankNote =
    fold.blankLinesConsumed > 0
      ? c.dim(` [${fold.blankLinesConsumed} blank line${fold.blankLinesConsumed === 1 ? '' : 's'} counted]`)
      : '';

  const lines = [
    `    ${c.bold(surface)} ${c.dim(`(${limitSummary})`)} ${status}${blankNote}`,
    `      ${c.dim('"')}${truncatedPreview}${foldSuffix}${c.dim('"')}`,
  ];
  return lines.join('\n');
}

function formatDiagnosticPretty(diag: LintDiagnostic, c: AnsiPalette): string {
  const sev = formatSeverityTag(diag.severity, c);
  const rule = c.bold(diag.ruleId);
  const cat = c.dim(`[${diag.category}]`);
  const penalty = diag.penaltyPoints > 0 ? c.dim(` (-${diag.penaltyPoints}pts)`) : '';
  const autoTag = diag.autoFixable ? ` ${c.cyan('[auto-fix]')}` : '';

  const lines: string[] = [];
  lines.push(`    ${sev} ${rule} ${cat}${penalty}${autoTag}`);
  lines.push(`          ${diag.message}`);
  if (diag.evidence) {
    lines.push(`          ${c.dim('Evidence:')} ${c.gray(diag.evidence)}`);
  }
  lines.push(`          ${c.dim('Fix:')} ${c.green(diag.fixHint)}`);
  if (diag.specRef) {
    lines.push(`          ${c.dim('Spec:')} ${c.gray(diag.specRef)}`);
  }
  return lines.join('\n');
}

function formatPlatformPretty(p: PlatformLintReport, c: AnsiPalette): string {
  const lines: string[] = [];
  const statusBadge = p.passed ? c.bgGreen(' PASS ') : c.bgRed(' FAIL ');

  lines.push(
    `  ${statusBadge} ${c.bold(p.platformName)} ${c.dim(`(${p.platform})`)}  ` +
      `Score ${colorScore(p.score, c)} ${colorGrade(p.grade, c)}  ` +
      `${c.red(`${p.errorCount}E`)} ${c.yellow(`${p.warningCount}W`)} ${c.cyan(`${p.infoCount}I`)}`
  );

  // Character / unit meter
  const countMeter = renderMeter(p.counts.count, p.counts.effectiveLimit, 20, c);
  const remainingText =
    p.counts.remaining >= 0
      ? c.dim(`${p.counts.remaining} left`)
      : c.red(`${Math.abs(p.counts.remaining)} over`);

  lines.push(
    `    Chars   ${countMeter} ${c.bold(String(p.counts.count))}/${p.counts.effectiveLimit} ` +
      `(${remainingText}) ${c.dim(`[${p.counts.algorithm}]`)}`
  );

  if (p.counts.maxBytes !== null) {
    const byteMeter = renderMeter(p.counts.utf8Bytes, p.counts.maxBytes, 20, c);
    lines.push(
      `    Bytes   ${byteMeter} ${c.bold(String(p.counts.utf8Bytes))}/${p.counts.maxBytes} UTF-8 bytes` +
        ` | Graphemes: ${p.counts.graphemes}`
    );
  } else {
    lines.push(
      `    Meta    Graphemes: ${p.counts.graphemes} | UTF-8 bytes: ${p.counts.utf8Bytes} | ` +
        `URLs: ${p.counts.urlCount} | Hashtags: ${p.counts.hashtagCount}`
    );
  }

  if (p.counts.apiHardLimit !== null && p.counts.apiHardLimit !== p.counts.hardLimit) {
    const apiStatus = p.counts.overApiLimit
      ? c.red(`EXCEEDS API CAP (${p.counts.apiHardLimit})`)
      : c.dim(`API cap: ${p.counts.apiHardLimit} vs Native: ${p.counts.hardLimit}`);
    lines.push(`    API Cap ${apiStatus}`);
  }

  // Fold simulation previews
  lines.push(formatFoldSnippet(p.folds.mobile, c));
  lines.push(formatFoldSnippet(p.folds.desktop, c));

  // Diagnostics
  if (p.diagnostics.length === 0) {
    lines.push(`    ${c.green('✓ All pre-flight checks cleared on this platform.')}`);
  } else {
    for (const diag of p.diagnostics) {
      lines.push(formatDiagnosticPretty(diag, c));
    }
  }

  return lines.join('\n');
}

export function formatPreFlightPretty(
  report: PreFlightReport,
  sourceLabel?: string
): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  lines.push(divider);
  const title = c.bold(c.cyan('POSTFLIGHT PRE-FLIGHT CHECKLIST'));
  const source = sourceLabel ? `  ${c.dim('•')}  ${c.white(sourceLabel)}` : '';
  lines.push(`${title}${source}`);

  const flightStatus = report.passed
    ? c.bgGreen(' CLEARED FOR TAKEOFF ')
    : c.bgRed(' HOLD — ISSUES FOUND ');

  lines.push(
    `${flightStatus}  Overall: ${colorScore(report.overallScore, c)} ${colorGrade(report.overallGrade, c)}  ` +
      `${c.red(`${report.totalErrors} errors`)}  ${c.yellow(`${report.totalWarnings} warnings`)}  ` +
      `${c.cyan(`${report.totalInfos} info`)}`
  );
  lines.push(divider);

  for (let i = 0; i < report.platforms.length; i += 1) {
    const platform = report.platforms[i];
    if (!platform) continue;
    lines.push(formatPlatformPretty(platform, c));
    if (i < report.platforms.length - 1) {
      lines.push('');
    }
  }

  if (report.autoFixPreview?.changed) {
    lines.push('');
    lines.push(divider);
    lines.push(c.bold(c.cyan('AUTO-FIXES AVAILABLE (re-run with --fix to apply)')));
    for (const fix of report.autoFixPreview.appliedFixes) {
      lines.push(`  ${c.green('+')} ${fix}`);
    }
  }

  lines.push(divider);
  return lines.join('\n');
}

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function severityEmoji(severity: Severity): string {
  switch (severity) {
    case 'error':
      return '🔴 ERROR';
    case 'warning':
      return '🟡 WARN';
    case 'info':
      return '🔵 INFO';
  }
}

export function formatPreFlightMarkdown(
  report: PreFlightReport,
  sourceLabel?: string
): string {
  const lines: string[] = [];
  const statusIcon = report.passed ? '✅' : '❌';
  const statusText = report.passed ? 'Cleared for Takeoff' : 'Pre-Flight Blocked';
  const headingSuffix = sourceLabel ? ` — \`${sourceLabel}\`` : '';

  lines.push(`## ${statusIcon} PostFlight Pre-Flight Report${headingSuffix}`);
  lines.push('');
  lines.push(
    `**Status:** ${statusText} | **Score:** \`${report.overallScore}/100\` (**${report.overallGrade}**) | ` +
      `**Errors:** ${report.totalErrors} | **Warnings:** ${report.totalWarnings} | **Info:** ${report.totalInfos}`
  );
  lines.push('');
  lines.push('| Platform | Status | Score | Count | Mobile Fold | Errors | Warnings | Info |');
  lines.push('| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');

  for (const p of report.platforms) {
    const icon = p.passed ? '✅ Pass' : '❌ Fail';
    const countCell =
      p.counts.maxBytes !== null
        ? `${p.counts.count}/${p.counts.effectiveLimit} (${p.counts.utf8Bytes}/${p.counts.maxBytes}B)`
        : `${p.counts.count}/${p.counts.effectiveLimit}`;
    const foldCell = p.folds.mobile.truncated
      ? `Truncated (${p.folds.mobile.visibleChars}ch)`
      : 'Full';

    lines.push(
      `| ${escapeMdCell(p.platformName)} (\`${p.platform}\`) | ${icon} | **${p.score}** (${p.grade}) | ` +
        `${escapeMdCell(countCell)} | ${escapeMdCell(foldCell)} | ${p.errorCount} | ${p.warningCount} | ${p.infoCount} |`
    );
  }

  const platformsWithDiagnostics = report.platforms.filter((p) => p.diagnostics.length > 0);
  if (platformsWithDiagnostics.length > 0) {
    lines.push('');
    lines.push('<details>');
    lines.push(
      `<summary>📋 Diagnostics Details (${report.totalErrors} errors, ${report.totalWarnings} warnings, ${report.totalInfos} info)</summary>`
    );
    lines.push('');

    for (const p of platformsWithDiagnostics) {
      lines.push(`### ${p.platformName} (\`${p.platform}\`) — ${p.score}/100 (${p.grade})`);
      lines.push('');
      lines.push('| Severity | Rule | Category | Message | Fix Hint |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const d of p.diagnostics) {
        const evidenceNote = d.evidence ? ` *(Evidence: \`${d.evidence}\`)*` : '';
        lines.push(
          `| ${severityEmoji(d.severity)} | \`${escapeMdCell(d.ruleId)}\` | \`${d.category}\` | ` +
            `${escapeMdCell(d.message + evidenceNote)} | ${escapeMdCell(d.fixHint)} |`
        );
      }
      lines.push('');
    }

    lines.push('</details>');
  }

  if (report.autoFixPreview?.changed) {
    lines.push('');
    lines.push('<details>');
    lines.push(
      `<summary>🔧 Auto-Fix Suggestions (${report.autoFixPreview.appliedFixes.length} available)</summary>`
    );
    lines.push('');
    for (const fix of report.autoFixPreview.appliedFixes) {
      lines.push(`- ${fix}`);
    }
    lines.push('');
    lines.push('Run `postflight check <file> --fix` locally to apply automatically.');
    lines.push('</details>');
  }

  lines.push('');
  lines.push(`<sub>Generated by PostFlight at ${report.timestamp}</sub>`);
  return lines.join('\n');
}

export function formatCompilationPretty(bundle: CompilationBundle): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  lines.push(divider);
  lines.push(
    `${c.bold(c.cyan('POSTFLIGHT COMPILATION BUNDLE'))}  ${c.dim('•')}  ` +
      `${c.white(bundle.sourceId)}  ${c.dim(`(${bundle.artifacts.length} targets)`)}`
  );
  lines.push(divider);

  for (const artifact of bundle.artifacts) {
    const scoreStr = colorScore(artifact.lintSummary.score, c);
    const threadLabel =
      artifact.posts.length > 1
        ? c.cyan(`${artifact.posts.length}-part thread`)
        : c.dim('single post');

    lines.push(
      `  ${c.bold(artifact.platformName)} ${c.dim(`(${artifact.platform})`)}  ` +
        `[${threadLabel}]  Lint: ${scoreStr} ` +
        `${c.dim(`(${artifact.lintSummary.errors}E / ${artifact.lintSummary.warnings}W)`)}`
    );

    if (artifact.adaptationsApplied.length > 0) {
      lines.push(`    ${c.dim('Adaptations:')}`);
      for (const adaptation of artifact.adaptationsApplied) {
        lines.push(`      ${c.green('•')} ${adaptation}`);
      }
    }

    if (artifact.utmUrl) {
      lines.push(`    ${c.dim('UTM URL:')} ${c.cyan(artifact.utmUrl)}`);
    }

    if (artifact.dmFunnelNote) {
      lines.push(`    ${c.dim('DM Funnel:')} ${c.yellow(artifact.dmFunnelNote)}`);
    }

    for (let i = 0; i < artifact.posts.length; i += 1) {
      const postText = artifact.posts[i];
      if (postText === undefined) continue;
      const facetCount = artifact.facets?.[i]?.length ?? 0;
      const facetSuffix = facetCount > 0 ? c.dim(` [${facetCount} Bluesky UTF-8 facets]`) : '';
      lines.push(`    ${c.bold(`[Post ${i + 1}/${artifact.posts.length}]`)}${facetSuffix}`);
      lines.push(indentBlock(postText, '      '));
    }

    if (artifact.firstComment) {
      lines.push(`    ${c.bold('[First Comment / Reply]')}`);
      lines.push(indentBlock(artifact.firstComment, '      '));
    }

    lines.push('');
  }

  lines.push(divider);
  return lines.join('\n');
}

export function formatSafeZonePretty(analysis: SafeZoneAnalysis): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  lines.push(divider);
  lines.push(
    `${c.bold(c.cyan('POSTFLIGHT SAFE-ZONE X-RAY'))}  ${c.dim('•')}  ${c.white(analysis.presetName)}`
  );

  const badge = analysis.allClear ? c.bgGreen(' ALL CLEAR ') : c.bgRed(' COLLISION ');
  lines.push(
    `${badge}  Preset: ${c.bold(analysis.presetId)}  Canvas: ${analysis.canvas.width}x${analysis.canvas.height}  ` +
      `Safe Area: ${c.bold(`${analysis.safeAreaPercent.toFixed(1)}%`)}`
  );
  lines.push(
    `  Safe Rect: x=${analysis.safeRect.x}, y=${analysis.safeRect.y}, ` +
      `w=${analysis.safeRect.width}, h=${analysis.safeRect.height}`
  );

  const notchText = analysis.deadZones.lowerRight
    ? `, lowerRight(y>=${analysis.deadZones.lowerRight.startY}, right=${analysis.deadZones.lowerRight.right}px)`
    : '';
  lines.push(
    `  Dead Zones: top=${analysis.deadZones.top}px, bottom=${analysis.deadZones.bottom}px, ` +
      `left=${analysis.deadZones.left}px, right=${analysis.deadZones.right}px${notchText}`
  );
  lines.push(divider);

  if (analysis.collisions.length === 0) {
    lines.push(`  ${c.dim('No bounding boxes provided. Pass --box x,y,w,h[:label] to test overlays.')}`);
  } else {
    for (const col of analysis.collisions) {
      const status = col.collides ? c.bold(c.red('COLLIDES')) : c.bold(c.green('CLEAR   '));
      const overlap = col.collides
        ? c.red(`${col.overlapAreaPx}px² (${col.overlapPercent.toFixed(1)}%) [${col.violatedEdges.join(', ')}]`)
        : c.dim('0% overlap');
      lines.push(`  ${status}  ${c.bold(col.boxLabel)} ${c.dim(`(${col.boxId})`)}  ${overlap}`);
      if (col.collides) {
        lines.push(`            ${c.yellow(col.recommendation)}`);
      }
    }
  }

  lines.push(divider);
  return lines.join('\n');
}

export function formatTriagePretty(items: TriagedComment[]): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const item of items) {
    counts[item.priority] += 1;
  }

  lines.push(divider);
  lines.push(
    `${c.bold(c.cyan('POSTFLIGHT COMMENT TRIAGE'))}  ${c.dim(`(${items.length} comments)`)}  ` +
      `${c.red(`P0:${counts.P0}`)} ${c.yellow(`P1:${counts.P1}`)} ` +
      `${c.cyan(`P2:${counts.P2}`)} ${c.dim(`P3:${counts.P3}`)}`
  );
  lines.push(divider);

  if (items.length === 0) {
    lines.push(`  ${c.dim('No comments to triage.')}`);
  }

  for (const item of items) {
    const prioBadge =
      item.priority === 'P0'
        ? c.bgRed(' P0 ')
        : item.priority === 'P1'
          ? c.bgYellow(' P1 ')
          : item.priority === 'P2'
            ? c.bgCyan(' P2 ')
            : c.dim('[P3]');

    const sla =
      item.recommendedSlaMinutes >= 60
        ? `${Math.round(item.recommendedSlaMinutes / 60)}h`
        : `${item.recommendedSlaMinutes}m`;

    const handle = item.comment.author.startsWith('@')
      ? item.comment.author
      : `@${item.comment.author}`;
    lines.push(
      `  ${prioBadge} ${c.bold(item.intent)} ${c.dim(`score=${item.score} SLA=${sla}`)}  ` +
        `${c.cyan(handle)} ${c.dim(`on ${item.comment.platform}`)}`
    );
    lines.push(`       "${item.comment.text}"`);
    if (item.matchedSignals.length > 0) {
      lines.push(`       ${c.dim('Signals:')} ${item.matchedSignals.join(', ')}`);
    }
    if (item.complianceFlag) {
      lines.push(`       ${c.bold(c.yellow('Compliance:'))} ${c.yellow(item.complianceFlag)}`);
    }
    lines.push(`       ${c.dim('Action:')} ${c.green(item.suggestedAction)}`);
    lines.push('');
  }

  lines.push(divider);
  return lines.join('\n');
}

export function formatTokensPretty(items: OAuthTokenHealth[]): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  const counts = { expired: 0, critical: 0, 'expiring-soon': 0, healthy: 0 };
  for (const item of items) {
    counts[item.status] += 1;
  }

  lines.push(divider);
  lines.push(
    `${c.bold(c.cyan('POSTFLIGHT OAUTH TOKEN HEALTH AUDIT'))}  ${c.dim(`(${items.length} connections)`)}  ` +
      `${c.red(`expired:${counts.expired}`)} ${c.red(`critical:${counts.critical}`)} ` +
      `${c.yellow(`expiring:${counts['expiring-soon']}`)} ${c.green(`healthy:${counts.healthy}`)}`
  );
  lines.push(divider);

  if (items.length === 0) {
    lines.push(`  ${c.dim('No OAuth connections supplied.')}`);
  }

  for (const item of items) {
    const statusBadge =
      item.status === 'expired'
        ? c.bgRed(' EXPIRED ')
        : item.status === 'critical'
          ? c.bgRed(' CRITICAL ')
          : item.status === 'expiring-soon'
            ? c.bgYellow(' EXPIRING ')
            : c.bgGreen(' HEALTHY ');

    const accessStr =
      item.accessHoursRemaining === null
        ? 'non-expiring'
        : `${item.accessHoursRemaining.toFixed(1)}h`;
    const refreshStr =
      item.refreshDaysRemaining === null
        ? 'n/a'
        : `${item.refreshDaysRemaining.toFixed(1)}d`;

    lines.push(
      `  ${statusBadge} ${c.bold(item.accountHandle)} ${c.dim(`(${item.platform} • ${item.connectionId})`)}`
    );
    lines.push(
      `      Access TTL: ${c.bold(accessStr)} | Refresh TTL: ${c.bold(refreshStr)} | ` +
        `Auto-Refresh: ${item.canAutoRefresh ? c.green('yes') : c.yellow('no')}`
    );

    for (const risk of item.risks) {
      lines.push(`      ${c.yellow('!')} ${risk}`);
    }
    lines.push(`      ${c.dim('Action:')} ${c.cyan(item.actionRequired)}`);
    lines.push('');
  }

  lines.push(divider);
  return lines.join('\n');
}

export function formatUtmPretty(audit: UtmAuditResult): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  lines.push(divider);
  lines.push(`${c.bold(c.cyan('POSTFLIGHT UTM & ATTRIBUTION AUDIT'))}`);
  lines.push(divider);
  lines.push(`  Original:   ${audit.originalUrl}`);
  lines.push(`  Normalized: ${c.cyan(audit.normalizedUrl)}`);
  lines.push(`  Valid URL:  ${audit.validUrl ? c.green('yes') : c.red('no')}`);
  lines.push(
    `  Click Noise:${audit.hasClickIdNoise ? c.yellow(' detected (fbclid/gclid/etc.)') : c.green(' none')}`
  );

  const paramKeys = Object.keys(audit.params);
  if (paramKeys.length > 0) {
    lines.push(`  Parameters:`);
    for (const key of paramKeys) {
      lines.push(`    ${c.dim(key)}=${audit.params[key] ?? ''}`);
    }
  }

  if (audit.issues.length === 0) {
    lines.push(`  ${c.green('✓ No UTM taxonomy issues found.')}`);
  } else {
    lines.push(`  Issues:`);
    for (const issue of audit.issues) {
      lines.push(`    ${formatSeverityTag(issue.severity, c)} ${c.bold(issue.code)} — ${issue.message}`);
    }
  }

  lines.push(`  ${c.dim('Dark Social Note:')} ${audit.darkSocialRiskNote}`);
  lines.push(divider);
  return lines.join('\n');
}

export function formatFfmpegPretty(result: FfmpegCommandResult): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  lines.push(divider);
  lines.push(`${c.bold(c.cyan('POSTFLIGHT FFMPEG MEDIA NORMALIZER'))}  ${c.dim(`(${result.platform})`)}`);
  lines.push(divider);
  lines.push(
    `  Target: ${result.targetSpecs.resolution} | ${result.targetSpecs.codec} | ` +
      `${result.targetSpecs.pixelFormat} | ${result.targetSpecs.colorSpace} | ` +
      `${result.targetSpecs.fps}fps | ${result.targetSpecs.videoBitrate} | ${result.targetSpecs.audioLoudness}`
  );
  lines.push(`  Faststart (moov atom): ${result.targetSpecs.faststart ? c.green('enabled') : c.yellow('disabled')}`);
  lines.push('');
  lines.push(`  ${c.bold('Command:')}`);
  lines.push(`  ${c.green(result.command)}`);
  if (result.warningsAddressed.length > 0) {
    lines.push('');
    lines.push(`  ${c.bold('Platform Gotchas Addressed:')}`);
    for (const w of result.warningsAddressed) {
      lines.push(`    ${c.cyan('•')} ${w}`);
    }
  }
  lines.push(divider);
  return lines.join('\n');
}

export function formatContrastPretty(result: ContrastResult): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));
  const check = (pass: boolean) => (pass ? c.green('PASS') : c.red('FAIL'));

  lines.push(divider);
  lines.push(`${c.bold(c.cyan('POSTFLIGHT WCAG 2.2 CONTRAST CHECK'))}`);
  lines.push(divider);
  lines.push(
    `  Foreground: ${c.bold(result.foreground)}  Background: ${c.bold(result.background)}  ` +
      `Ratio: ${c.bold(`${result.ratio.toFixed(2)}:1`)}`
  );
  lines.push(
    `  AA Normal (>=4.5): ${check(result.aaNormal)}  |  AA Large (>=3.0): ${check(result.aaLarge)}  |  ` +
      `AA Non-Text (>=3.0): ${check(result.aaNonText)}`
  );
  lines.push(
    `  AAA Normal (>=7.0): ${check(result.aaaNormal)} |  AAA Large (>=4.5): ${check(result.aaaLarge)}`
  );
  lines.push(`  ${c.dim('Recommendation:')} ${result.recommendation}`);
  lines.push(divider);
  return lines.join('\n');
}

export function formatDuplicatesPretty(collisions: DuplicateCollision[]): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  lines.push(divider);
  lines.push(
    `${c.bold(c.cyan('DUPLICATE & CANNIBALIZATION CHECK'))}  ${c.dim(`(${collisions.length} collision${collisions.length === 1 ? '' : 's'})`)}`
  );
  lines.push(divider);

  for (const col of collisions) {
    const riskBadge =
      col.risk === 'critical'
        ? c.bgRed(' CRITICAL ')
        : col.risk === 'high'
          ? c.bgYellow(' HIGH ')
          : c.bgCyan(' MODERATE ');
    const sim = `${Math.round(col.jaccardSimilarity * 100)}% similarity`;
    const matchType = col.exactMatch ? 'EXACT MATCH' : sim;
    lines.push(`  ${riskBadge} ${c.bold(col.draftA)} ↔ ${c.bold(col.draftB)} (${matchType})`);
    if (col.cannibalizationWarning) {
      lines.push(`      ${c.yellow(col.cannibalizationWarning)}`);
    }
    lines.push(`      ${c.dim('Recommendation:')} ${col.recommendation}`);
  }

  lines.push(divider);
  return lines.join('\n');
}

export function formatSpecPretty(spec: PlatformSpec): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  lines.push(divider);
  lines.push(
    `${c.bold(c.cyan(spec.name))} ${c.dim(`(${spec.id})`)}  ` +
      `${c.dim(`v${spec.specVersion} • verified ${spec.lastVerified}`)}`
  );
  lines.push(divider);
  lines.push(
    `  Counting:  ${spec.counting.algorithm} | Hard limit: ${c.bold(String(spec.counting.hardLimit))}` +
      (spec.counting.apiHardLimit !== null ? ` | API limit: ${spec.counting.apiHardLimit}` : '') +
      (spec.counting.maxBytes !== null ? ` | Max UTF-8 bytes: ${spec.counting.maxBytes}` : '') +
      (spec.counting.urlWeight !== null ? ` | URL weight: ${spec.counting.urlWeight}` : '')
  );
  lines.push(`             ${c.dim(spec.counting.notes)}`);
  lines.push(
    `  Fold:      Mobile ${spec.folds.mobileChars ?? 'none'}ch/${spec.folds.mobileLines ?? 'none'}L | ` +
      `Desktop ${spec.folds.desktopChars ?? 'none'}ch/${spec.folds.desktopLines ?? 'none'}L | ` +
      `Blank lines count: ${spec.folds.blankLinesCountAsLines ? 'yes' : 'no'} | Label: "${spec.folds.foldLabel}"`
  );
  lines.push(
    `  Hashtags:  Recommended ${spec.hashtags.recommendedMin}-${spec.hashtags.recommendedMax}` +
      (spec.hashtags.hardCap !== null ? ` | Hard cap: ${spec.hashtags.hardCap}` : '') +
      ` | Style: ${spec.hashtags.style}`
  );
  lines.push(
    `  Links:     Clickable: ${spec.links.clickableInBody ? 'yes' : 'no'} | ` +
      `Body penalty risk: ${spec.links.bodyPenaltyRisk} | First comment safe: ${spec.links.firstCommentSafe ? 'yes' : 'no'}`
  );
  lines.push(`             ${c.dim(spec.links.recommendedStrategy)}`);
  lines.push(
    `  Alt Text:  ${spec.altText.supported ? `Supported (max ${spec.altText.maxChars ?? 'n/a'}, rec <=${spec.altText.recommendedMax ?? 'n/a'})` : 'Not supported'}`
  );
  lines.push(
    `  Media:     Max images: ${spec.media.maxImages} | Ratios: ${spec.media.aspectRatios.join(', ')} | ` +
      `Watermark penalized: ${spec.media.watermarkPenalized ? 'yes' : 'no'}`
  );
  if (spec.oauth) {
    lines.push(
      `  OAuth:     Access TTL: ${spec.oauth.accessTokenTtlHours ?? 'non-expiring'}h | ` +
        `Refresh TTL: ${spec.oauth.refreshTokenTtlDays ?? 'n/a'}d | ` +
        `Auto-refresh: ${spec.oauth.supportsProgrammaticRefresh ? 'yes' : 'no'}`
    );
    lines.push(`             ${c.yellow(spec.oauth.gotcha)}`);
  }
  lines.push(divider);
  return lines.join('\n');
}

export function formatKillSwitchPretty(
  state: KillSwitchState,
  chainValid?: { valid: boolean; brokenAtSeq?: number | null }
): string {
  const c = createAnsi();
  const lines: string[] = [];
  const divider = c.dim('─'.repeat(72));

  lines.push(divider);
  const badge = state.frozen ? c.bgRed(' FROZEN — KILL SWITCH ACTIVE ') : c.bgGreen(' ACTIVE — PUBLISHING ALLOWED ');
  lines.push(`${c.bold(c.cyan('POSTFLIGHT GOVERNANCE KILL SWITCH'))}  ${badge}`);
  lines.push(divider);
  if (state.frozen) {
    lines.push(`  Frozen At: ${state.frozenAt ?? 'unknown'}`);
    lines.push(`  Frozen By: ${state.frozenBy ?? 'unknown'}`);
    lines.push(`  Reason:    ${c.red(state.reason ?? 'none')}`);
  }
  lines.push(`  Blocked Publish Attempts: ${state.blockedAttemptCount}`);
  lines.push(`  Audit Log Entries:        ${state.auditLog.length}`);
  if (chainValid) {
    lines.push(
      `  Hash Chain Integrity:     ${
        chainValid.valid
          ? c.green('VALID (SHA-256 tamper-evident chain intact)')
          : c.red(`BROKEN at seq #${chainValid.brokenAtSeq ?? '?'}`)
      }`
    );
  }
  const recent = state.auditLog.slice(-5);
  if (recent.length > 0) {
    lines.push('');
    lines.push(`  ${c.bold('Recent Audit Entries:')}`);
    for (const entry of recent) {
      lines.push(
        `    #${entry.seq} ${c.dim(entry.timestamp)} ${c.bold(entry.action)} ` +
          `by ${c.cyan(entry.actor)} — ${entry.reason} ${c.dim(`[${entry.hash.slice(0, 12)}]`)}`
      );
    }
  }
  lines.push(divider);
  return lines.join('\n');
}
