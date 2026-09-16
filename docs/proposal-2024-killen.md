## 

| Creating a Better Feedback Loop |  | Summary Introduce a new workflow that creates a streamlined maintainer \-\> end user feedback loop by syncing designated project issues to GitHub discussions in a dedicated CNCF GitHub org giving end users a single place to provide feedback. |
| :---- | :---- | :---- |
|  **Author**: Bob Killen **Reviewers**:  | **Status:** Draft **Created**: 2023-10-14**Updated:** 2024-08-12 |   |

## Overview  {#overview}

The current way in which open source projects and end users communicate with each other is full of friction. End users struggle to navigate the 175+ projects and hundreds of repos in the CNCF ecosystem, each of which has a different preferred way of engagement. When they do finally engage, their feedback often gets lost in the technical implementation discussion between maintainers or isn’t actionable.

Simultaneously, maintainers struggle to get meaningful feedback from end users using their project in a production environment and often turn to anecdotal feedback via social media. This lack of feedback can hold up development or come too late after a feature has gone GA and is difficult to adapt to meet the end user's needs.

This friction extends past end users and maintainers and impacts corporate contributors and OSS Product Managers, who must gauge interest and impact to justify their company’s continued support of projects.

This proposal introduces a new workflow utilizing GitHub discussions, issue templates, and additional automation to streamline the feedback process. This will be accompanied by a new dashboard that will provide valuable metrics to maintainers and OSS Product Managers.  This will create a consistent method for projects to solicit feedback, provide end users with **a single place** to engage the projects, and offer valuable business insights to the vendors supporting maintainers.

## 

[Overview](#overview)

[User Stories](#user-stories)

[Maintainer](#maintainer)

[End User](#end-user)

[Company with OSS based Products ( OSS PMs)](#company-with-oss-based-products-\(-oss-pms\))

[Goals](#goals)

[Non-Goals](#non-goals)

[Proposed Solution](#proposed-solution)

[Issue-Discussion Sync GitHub App](#issue-discussion-sync-github-app)

[Initial Configuration](#initial-configuration)

[Opening a Feedback Discussion](#opening-a-feedback-discussion)

[Updating a Feedback Discussion](#updating-a-feedback-discussion)

[Closing a Feedback Discussion](#closing-a-feedback-discussion)

[Feedback Discussion Dashboard](#feedback-discussion-dashboard)

[Metrics & Data Points](#metrics-&-data-points)

[Datapoints](#datapoints)

[Risks and Challenges](#risks-and-challenges)

[Lack of Engagement](#lack-of-engagement)

[Unreliable Affiliation Data](#unreliable-affiliation-data)

[Engaging the Wrong Audience](#engaging-the-wrong-audience)

[Poorly Communicating Feedback Requests](#poorly-communicating-feedback-requests)

[Implementation Plan](#implementation-plan)

[Stage 1: Proof of Concept](#stage-1:-proof-of-concept)

[PoC Project List](#poc-project-list)

[PoC User List](#poc-user-list)

[Stage 2: Automation](#stage-2:-automation)

[Stage 3: Growth & Metrics](#stage-3:-growth-&-metrics)

[Change Log](#change-log)

[References](#references)

[Issue Template yaml](#issue-template-yaml)

## User Stories {#user-stories}

### Maintainer {#maintainer}

- I would like to get useful feedback from end users on the features & initiatives my project is developing.  
- I would like to separate feedback from technical implementation discussion.  
- I would like end users to try features early and provide feedback so that we can implement changes before a feature or change is promoted to GA.  
- I would like to see what features & initiatives end users would like my project to prioritize.  
- I would like to better understand what industries my project is being used in and their associated needs.  
- I would like to know that the feedback I’m getting is from users or organizations that are using my project in real scenarios, such as production  and testing environments.  
- I would like to get feedback without significantly extra steps or interrupting my developer workflow.  
- **\[corporate\]** I would like to use the feedback to help justify my upstream involvement.  
- **\[corporate\]** I would like to know if any customers have engaged and provided feedback on features or initiatives I’m working on.  
- **\[corporate\]** I would like to ensure that my participation in OSS leads to commercial opportunities for my company.  
- **\[corporate\]** I would like my company to be more involved in the ecosystem / foundation. I might give that a try, just send at mentions / assigned to email as my priority.

### End User {#end-user}

- I would like to provide feedback to projects on features and initiatives without having to navigate every project’s organization.  
- I would like to understand how features & initiatives impact my environment.  
- I would like my time testing alpha/beta features to provide meaningful feedback to be worthwhile.  
- I would like to provide feedback that is actionable (e.g. before a feature has gone GA, or early in the development process).  
- I would like to be able to tell projects which features & initiatives are important to my organization.  
- I would like to follow the development of the features & initiatives that are important to my organization.  
- I would like to use this engagement to help justify my organization’s investment in the foundation and ecosystem.  
- As I make useful contributions to the project, my next contributions should be looked at more quickly.  
- As I make useful contributions to the project, my opinions/feedback on other contributions should be weighted more highly.  
- I would like to know that a project is dead so I can avoid spending resources on it.

### Company with OSS based Products ( OSS PMs) {#company-with-oss-based-products-(-oss-pms)}

- I would like to get feedback on features my organization supports the development of.  
- I would like to understand what features & initiatives my customers would like prioritized.  
- I would like to understand what features & initiatives end users and their industry verticals would like prioritized.  
- I would like to use this engagement to help quantify business impact.  
- I would like to ensure that I am aligned with our OSS engineers.  
- I would like to use this engagement to support our continued investment in the foundation and the ecosystem.

## Goals {#goals}

- Provide a unified method for end users to provide feedback to projects in a single place without disrupting maintainer workflows.  
- Improve both the end user & maintainer experience by separating the discussion on technical implementation from feedback on features & initiatives.  
- Provide projects with additional information they can use to better understand the needs of the user and adjust their project’s priorities accordingly.  
- Create additional avenues for projects & vendors to tie their open source contributions to internal business value.

## Non-Goals {#non-goals}

- Provide an outlet for end user support.  
- Serve as a platform for vendors to get feedback on non-oss features.

## Proposed Solution {#proposed-solution}

Introduce a new workflow that creates a streamlined maintainer \-\> end user feedback loop by syncing designated project issues to GitHub discussions in a dedicated CNCF GitHub org giving end users a **single place** to provide feedback. This workflow would separate the technical implementation details from end user feedback. Maintainers could work with issues and use them just as they would any other issue, labeling them and adding them to their own boards and milestones. These issues would be created using a specific GitHub issue template that a GitHub app will parse and use to create the dedicated feedback GitHub discussion.

Along with this new workflow, a new *Feedback Discussion Dashboard* would be created to provide valuable metrics to maintainers and OSS PMs, enabling them to make better decisions about priorities and investments.

**Dedicated GitHub Org**  
With 175+ projects and frequently 10+ repos per project, finding the right place to provide feedback as an end user is challenging at best. When end users do engage, they often comment or create issues in the wrong place. A dedicated GitHub org with one repo per project combined with subproject based discussion categories gives end users **one place** to go, and the templated feedback posts provide a consistent cross-project experience. This separate org structure also lends itself to generating higher fidelity metrics that maintainers and OSS PMs can use to set priorities and judge interest in specific enhancements.

**GitHub Discussions**  
GitHub Discussions are better aligned for providing feedback. Posts can be upvoted to signal priority, and threaded replies make it easier to respond directly to a user without derailing the entire discussion.

**Encouraging Vendor Engagement**  
Many end users are **not** using an open source project directly but a derivative product based on an open source project. These products frequently have a direct way to enable a feature created in the open source version, albeit differently from how you would enable it in the open source version. Vendors should be encouraged to engage in the discussions and reply with instructions on how to enable it in their product. If feedback was limited to just the open source version, it is unlikely that sufficient feedback would be provided from users using the project in a production capacity.

### Issue-Discussion Sync GitHub App {#issue-discussion-sync-github-app}

Within a new GitHub org, a repo is created for each project. A config file in each repo defines the categories, labels and what sources are allowed.

#### Initial Configuration {#initial-configuration}

**Project Feedback Repo**  
A repo is created in the feedback GitHub organization and is then seeded with the project specific configuration file. The configuration file will define what organizations or repos are allowed to use it as a sync target, the labels that should be created for the feedback repo, the discussion categories, and if they should be managed by the bot (GitHub App) or not.

**Example Configuration File**

| Name: foo projectSources:                          *\# Orgs and Repos that are allowed sources*  \- "github.com/foo/\*"            *\# for posts*  \- "github.com/foo/bar"FeedbackLabel: "feedback: yes"    *\# Label to signal if an issue should be synced*Labels:                           *\# Labels that can be used with discussion posts* \- name: performance              \- description: "Performance enhancements" \- color: "\#4572e6"Categories:                       *\# Discussion Categories for the repo*\- Name: Enhancements  Managed: true                   *\# If the bot should auto-close posts*  AllowedAuthors:                 *\# from users not listed under the*   \- Alice                         *\# allowedAuthors field (only allow posts*  \- Bob                           *\# synced from an external source)*  \- FeedbackBot\- Name: "Feature Requests"        *\# Unmanaged category for general*  Managed: false                  *\# discussions* |
| :---- |

  

**Project Configuration**  
The project’s GitHub admins must first authorize the Issue-Discussion Sync App. It can be limited to specific repos if the admins do not desire it to be enabled project wide.

In the repos the maintainers wish to create enhancement feedback issues, they must make and use an issue template ([example](https://docs.google.com/document/d/1TWnOjFw01yTPBvLSKvAMs7nyv9PCFkmhlG4DcnLPTEY/edit#bookmark=id.bb5i1myrr5f5)) with a header and footer to indicate the fields to be synced along with the minimum required fields: target feedback repo, target category, and title of the target discussion. These would tell the bot where the discussion should be created.  
   
Other fields, such as labels, descriptions, and instructions, may be changed to suit the project, but they are encouraged to share standard fields to make them easier for end users to consume. These fields would be indicated by being between the header and footer. The header and footer enable the project maintainers to "share" the issue with the feedback sync app; they could add fields to be used solely by the project in the issue's original location for the project's own purposes. 

#### Opening a Feedback Discussion {#opening-a-feedback-discussion}

Creating an enhancement issue and opening it for feedback follows a simple workflow:

1) **Maintainer:** Enhancement issue created based on the feedback issue template.  
2) **Maintainer:** Once enhancement is ready for feedback, the issue is labeled with the FeedbackLabel.  
3) **Bot:** Bot begins sync, creates discussion thread based off the source issue if validation passes and it is from an allowed source. It then applies labels etc.  
4) **Bot:** Responds on created discussion thread with link to source issue.  
5) **Bot:** Responds on source issue with a link to the feedback thread.

This lets the maintainers create and manage the enhancement issues like any other issue. They may add it to project boards, add their own assignees, and discuss its implementation. The feedback discussion will ***only*** be created once the FeedbackLabel is applied. This lets the maintainers solidify the implementation details, and sync the issue only when it's ready to be published.

#### Updating a Feedback Discussion {#updating-a-feedback-discussion}

The bot will watch the labeled issues for updates. Should the source issue content be changed, it will sync the changes to the discussion to mirror the content. This will allow the feedback thread to remain consistent across development phases (e.g. alpha, beta, stable). 

#### Closing a Feedback Discussion {#closing-a-feedback-discussion}

If the source issue is updated, setting the field FeedbackState to Closed, the bot will close the discussion. Controlling the state of the discussion from the issue will reduce administrative overhead by allowing the maintainers to close the discussion without having to grant individuals higher levels of permissions in the target feedback repo directly.

### Feedback Discussion Dashboard {#feedback-discussion-dashboard}

While creating a better feedback loop is already quite impactful, being able to provide additional information that can help maintainers and OSS PMs discern feedback from *actual users* and their priorities is a significant boon.

The Feedback Dashboard should show metrics like rank, number of comments, and number of individuals/organizations participating in the discussion. It should also be able to drill down by project, category, and discussion and apply filters for affiliation and labels.

For maintainers, it would provide a high-level view of what enhancements are seeing the most engagement and in what enhancement areas (label). For corporate maintainers, this can be used to support their continued involvement in the project. For both, it would provide an ecosystem-wide view of users' priorities, increasing maintainer situational awareness and advancements in their competitive domain.

For OSS PMs, the dashboard would provide valuable business intelligence. By filtering on affiliation, they could see what enhancements their customers are interested in and look at their feedback. They could also gauge areas that might warrant further investment based on user priority.

#### Metrics & Data Points {#metrics-&-data-points}

##### Datapoints {#datapoints}

| Name | Description | Datasource |
| ----- | ----- | ----- |
| Maintainers | List of maintainers for project(s) | Feedback Loop App |
|  | **Implementation Details** | **Notes** |
|  | App gathers & aggregates list of github IDs in org(s) associated with project. Populated on app authorization and updated on a regular cadence (daily?).  |  |

| Name | Description | Datasource |
| ----- | ----- | ----- |
| Organization | Affiliations for individuals | Devprofile, gitdm, or GitHub Profile |
|  | **Implementation Details** | **Notes** |
|  |  | devprofile may be a better source, there will more than likely be users who are not as fluent with git interacting with the discussions and it is more user friendly. Probably the best option would be to seed from devstats, and new users pull from devprofile, or GitHub Profile as a fallback. |

| Name | Description | Datasource |
| ----- | ----- | ----- |
| CNCF Member Orgs | List of CNCF member groups by type | \- CNCF Members (all) \- CNCF End Users \- CNCF Vendors? (unsure of name) |
|  | **Implementation Details** | **Notes** |
|  |  |  |

| Name | Description | Datasource |
| ----- | ----- | ----- |
| CNCF Member Tiers | List(s) of CNCF member by tier | \- All Tiers \- Platinum \- Gold \- Silver \- Supporter \- Academic |
|  | **Implementation Details** | **Notes** |
|  |  |  |

| Name | Description | Datasource |
| ----- | ----- | ----- |
| Discussion Labels | Project specific labels | Configured in the project config, but source of truth could be the GitHub GraphQL API for the project / category |
|  | **Implementation Details** | **Notes** |
|  | Discussions objects have a label array of type [LabelConnection](https://docs.github.com/en/graphql/reference/objects#labelconnection) DIscussion Event have a [label event type with some details](https://docs.github.com/en/webhooks/webhook-events-and-payloads?actionType=labeled#discussion) |  |

## Risks and Challenges {#risks-and-challenges}

### Lack of Engagement {#lack-of-engagement}

The largest risk is a lack of engagement from either the projects or end users. If a project does not utilize the tools to solicit feedback, there will be nothing for end users to engage with. Similarly, if the end users do not engage, then the projects and supporting companies will not see an incentive to continue to try and solicit feedback. A quiet beta launch with a few select projects, the End User TAB, and interested end users can act as a seed to ensure something is already there before a wider launch. Still, it will likely require ongoing outreach and support until it sees larger adoption.

### Unreliable Affiliation Data {#unreliable-affiliation-data}

If affiliation data is unreliable, it will be more challenging to determine whether the feedback comes from “real” users. It could also disincentivize Companies/OSS PMs if they cannot rely on the information to inform them of their customer’s priorities. This is difficult to address directly; however, the risk can be reduced if there is widespread encouragement (e.g., brought up in zero to merge or in the discussion faq)  to ensure affiliation data is kept up to date.

### Engaging the Wrong Audience {#engaging-the-wrong-audience}

For the feedback to be meaningful, the comments and suggestions must be from users using the project or a derivative product in a production-like capacity. One side effect of creating an environment where it is easy to provide feedback is that the discussions could become overwhelmed by comments from users who are not using the project as intended or are new to the project and looking for an avenue for support. 

Support comments can be partially mitigated by clearly communicating discussion rules in multiple places (e.g. repo README, pinned rule threads), aggressively moderating the discussions to keep things on topic, and disabling issues and other unused repo features.

There is no easy way native to GitHub to determine if feedback is provided from real users. However the Feedback Discussion Dashboard could be used to look at overall commenters affiliation to get a rough idea on the status of the commenter.

In the future, if GitHub implements additional user identifiers beyond Maintainer, a CNCF Member identifier could be created. This would both recognize the user as a CNCF member and give maintainers an easier way to quickly filter out feedback from commenters who may not be using the project in a production-like environment.

#### 

### Poorly Communicating Feedback Requests {#poorly-communicating-feedback-requests}

Open Source maintainers often struggle to describe their work in a way that a user can quickly understand without in-depth knowledge of the subject. If an end user has difficulty understanding what the feature does or how it is enabled, little feedback will likely be provided. There are two ways this could potentially be countered:

1) Work with the initial seed participating projects to craft user friendly feedback requests. With enough good examples, other project maintainers will likely follow suit.  
2) Develop material & resources to coach maintainers on better communication practices.  
3) Create pathways for knowledgable end users to get directly involved with crafting feature descriptions and docs.  
4) Engage vendor Product Managers to get involved to help draft the feedback requests. Product Managers often engage with end users and have more expertise in crafting user friendly documentation. Their work will initially need to be vetted to ensure they do not favor their product, and may need coaching to avoid “competing” to respond to requests. However, getting PMs engaged will likely have the long-term benefit of creating a stronger association of the open source project to business value.

## Implementation Plan {#implementation-plan}

#### Stage 1: Proof of Concept {#stage-1:-proof-of-concept}

| Task | Assignee(s) | Details |
| ----- | ----- | ----- |
| Create GitHub Feedback Org | [Bob Killen](mailto:bkillen@linuxfoundation.org) | Create initial GitHub org, bring under enterprise account, scaffold permissions, etc. |
| Create 1-pager & deck | [Bob Killen](mailto:bkillen@linuxfoundation.org) | Create doc & deck intended for sharing with potential end users & projects. |
| Assemble End User Stakeholders | Bob / TAB | Assemble a list of potential end users that would be interested in participating in the PoC. |
| Assemble Project Stakeholders | Bob / TAB | Assemble a list of projects that would like to participate in PoC. Projects should be ones that end user stakeholders are interested in and have feedback for. Alternatively projects could suggest end user participants that might be interested in becoming an end user stakeholder. |
| Create guidelines and rules for participating in project feedback org | Feedback WG | General guidelines for participating. This should include things like:\- general behavior expectations\- discussions are not meant to be used for general support\- instructions to enable feature(s) on vendor platforms are acceptable, but it should \-NEVER- be used for a marketing outlet. |
| Create project template repo with base configuration | [Bob Killen](mailto:bkillen@linuxfoundation.org) | Template repo will be stubbed with general README, CoC, scaffolding for discussions etc. Each participating project will have their repo generated from this template. |
| Schedule general check-ins with stakeholders (email, slack, call) | Feedback WG | Regular check-ins projects and users to gather feedback on process / workflow. Feedback will be integrated into automation. |
| Post Stage 1 evaluation &  summary | Feedback WG | Summarize feedback and update proposal as needed to move to stage 2 (automation) |
| KubeCon Marketing Plan & Assets | Feedback WG / CNCF Staff | Create Assets for use in KubeCon. Could be keynote slides, updated 1 pager, GB slides, etc. |

#### PoC Project List {#poc-project-list}

| Project | Contact | Comments |
| ----- | ----- | ----- |
| Istio | Lin Sun, Mitch Conners |  |
| Open Telemetry (TBD) | Alolita Sharma |  |
| Argo (TBD) | Henrik Blix |  |
| Envoy | Mike Bowen |  |
|  |  |  |

#### PoC User List {#poc-user-list}

| End User Org | Contact | Comments |
| ----- | ----- | ----- |
| Apple | Alolita Sharma | TAB Member (chair) |
| Adobe | Joseph Sandoval | TAB Member |
| Black Rock Financial | Mike Bowen | TAB Member |
| Boeing | Chad Beaudin | TAB Member |
| CERN | Ricardo Rocha | TAB Member |
| Fidelity Investments | Amr Abdelhalem | TAB Member |
| Mercedes-Benz | Mario Constanti | TAB Member |

### Stage 2: Automation {#stage-2:-automation}

| Task | Assignee(s) | Details |
| ----- | ----- | ----- |
| Create SoW with GitHub automation implementation details | Feedback WG / CNCF Staff | Define scope and milestones for GitHub bot. |
| Engage LFX for metrics / dashboard implementation | [Bob Killen](mailto:bkillen@linuxfoundation.org) | Define and surface meaningful metrics from discussions. NOTE: Blocked by ingestion of GitHub discussion metrics |
| Create automation documentation | CNCF Staff | Create docs on implementation, usage and best practices. |
| Work with current adopters to integrate automation | Projects team | Work with current projects to move from manual process to automated process. |
| Integrate feedback process into project onboarding | Projects Team | Add creation of feedback repo into project onboarding docs. Make sure new projects understand how it should be used. |
| Create docs & media on how metrics can be used | [Bob Killen](mailto:bkillen@linuxfoundation.org) | Additional information on the metrics, and how they can be used from all personas |

### Stage 3: Growth & Metrics {#stage-3:-growth-&-metrics}

| Task | Assignee(s) | Details |
| ----- | ----- | ----- |
| Refine deck/docs for sharing with wider audience | [Bob Killen](mailto:bkillen@linuxfoundation.org) |  |
| Project Outreach Campaign |  | Engage projects through various avenues with goal of getting xx% projects using the it by \<keydate\> |
| User Outreach Campaign |  | Engage end user members through various avenues with goal of getting xx% projects using the it by \<keydate\> |
| Organization Outreach Campaign |  | Discuss how to engage and how to derive value beyond improvements to project/products  |
|  |  |  |

## Change Log {#change-log}

| Date | Description |
| :---- | :---- |
| 2024-09-05 | Added users to PoC group Added projects to PoC group |
| 2024-07-22 | Proposal moved to new location (this doc) Added [implementation plan](#implementation-plan) |
| 2024-03-08 | Added more details to dashboard / metrics section |
| 2024-02-19 | Updated maintainer user stories Updated end user user stories Clarified goal statements Expanded on ideas to prevent discussions being used for support vs feedback Updated poor communication risk with additional mitigation ideas |
| 2023-12-18 | Added information on header/footer in issue template |
| 2023-10-18 | Added Unreliable Affiliation Data Risk |

## References {#references}

### Issue Template yaml {#issue-template-yaml}

| name: Feedback Requestdescription: "End User Feedback Request"title: "Feature: \[foo\]"Body: \- id: begin-block   type: markdown   Attributes:     Value: “\<\!-- BEGIN-BLOCK \--\>"\- id: target-repo  type: dropdown  attributes:    label: "Feedback Repo Target"    options:    \- "cncf/feedback"    default: 0  validations:    required: true\- id: target-category  type: dropdown  attributes:    label: "Feedback Category"    options:    \- "Enhancements"    default: 0  validations:    required: true\- id: title  type: input  attributes:    label: "Title:"    placeholder: "Title of Description in feedback repo"  validations:    required: true\- id: feedback-state  type: dropdown  attributes:    label: "Feedback discussion open or closed?"    options:    \- "Open"    \- "Closed"    default: 0  validations:    required: true\- id: labels  type: checkboxes  attributes:    label: "Labels:"    options:     \- label: performance     \- label: storage\- id: short-description  type: textarea  attributes:    label: "Short User Friendly Description:"  validations:    required: true\- id: detailed-description  type: textarea  attributes:    label: "Detailed Description:"  validations:    required: true\- id: instructions  type: textarea  attributes:    label: "Instructions:"  validations:    required: true\- id: resources  type: textarea  attributes:    label: "Additional Links and Resources:" \- id: end-block   type: markdown   Attributes:     Value: “\<\!-- END-BLOCK \--\>" \- id: project-related-question   type: markdown   Attributes:     Value: “field for the project to use for itself" |
| :---- |

