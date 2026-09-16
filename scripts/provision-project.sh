#!/usr/bin/env bash
#
# Provision a feedback repo for a project, or bring an existing one into line.
#
#   ./scripts/provision-project.sh cert-manager
#   ./scripts/provision-project.sh istio envoy opentelemetry
#   ORG=cncf-projects ./scripts/provision-project.sh cert-manager
#
# Idempotent: safe to re-run against every repo any time to correct drift.
# Requires admin on the hub org.
set -euo pipefail

ORG="${ORG:-cncf-projects}"
[[ $# -gt 0 ]] || { echo "usage: $0 <project> [project...]" >&2; exit 64; }

fail=0

for P in "$@"; do
  echo "== $ORG/$P"

  if gh repo view "$ORG/$P" >/dev/null 2>&1; then
    echo "  repo exists"
  else
    gh repo create "$ORG/$P" --public \
      --description "End-user feedback for $P. Discussions only." >/dev/null
    echo "  repo created"
  fi

  # Discussions on, everything else off. These repos host conversation and
  # nothing else: an open issue tracker here splits the very conversation the
  # hub exists to consolidate, and invites support tickets aimed at a repo with
  # no code and no maintainers watching it.
  gh api --method PATCH "repos/$ORG/$P" \
    -F has_discussions=true \
    -F has_issues=false \
    -F has_wiki=false \
    -F has_projects=false \
    -F has_pull_requests=false \
    -F pull_request_creation_policy=collaborators_only \
    -F has_downloads=false \
    --jq '"  discussions=\(.has_discussions) issues=\(.has_issues) wiki=\(.has_wiki) projects=\(.has_projects) forking=\(.allow_forking)"'

  # Actions is a separate API and is ON by default. A feedback repo has no code
  # to build, so a workflow here is only an attack surface.
  gh api --method PUT "repos/$ORG/$P/actions/permissions" -F enabled=false \
    && echo "  actions disabled" \
    || echo "  WARN: could not disable Actions (needs admin)"

  # NOT settable: public forking. `allow_forking` controls PRIVATE forks only
  # ("Either true to allow private forks, or false to prevent private forks").
  # A public repo can always be forked; that is a platform property, not drift.
  # A fork carries no discussions, so the blast radius is an empty lookalike.

  # Pull requests are disabled outright via has_pull_requests. Keeping the repo
  # empty is belt and braces, not the mechanism.
  if gh api "repos/$ORG/$P/branches" --jq 'length' 2>/dev/null | grep -qv '^0$'; then
    echo "  note: repo has branches; PRs are disabled by setting regardless"
  fi

  # Verify, do not assume. A PATCH that silently no-ops leaves a repo that looks
  # provisioned and is not.
  state=$(gh api "repos/$ORG/$P" --jq '[.has_discussions, .has_issues, .has_wiki, .has_projects, .has_pull_requests, .has_pages, .has_downloads] | @csv')
  if [[ "$state" != "true,false,false,false,false,false,false" ]]; then
    echo "  FATAL: settings did not apply (discussions,issues,wiki,projects,prs,pages,downloads = $state)" >&2
    fail=1
    continue
  fi

  # Category format cannot be read from the API, only its name and answerability.
  # `Announcements` ships as announcement-format on every new repo, which is what
  # restricts thread creation to maintainers and the App.
  gh api graphql -f query="{repository(owner:\"$ORG\",name:\"$P\"){
      id discussionCategories(first:25){nodes{id name}}
    }}" --jq '.data.repository | "  repo_id=\(.id)", (.discussionCategories.nodes[] | "  category: \(.name) = \(.id)")'

  echo "  reminder: confirm the target category is announcement-format in repo settings"
done

exit $fail
