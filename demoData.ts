/**
 * Isolated Demo Data Adapter for LazyLift
 * Integrates precomputed JSON (lazylift_demo_data_updated.json) for 2025 Mid Sem Software Architecture course pack.
 * Bypasses live parsing and LLM calls for instant, exact demo execution.
 */

export interface DemoFileSpec {
  id: string;
  filename: string;
  type: string;
  pages?: number;
  slides?: number;
  totalMarks?: number;
  year?: number;
  title: string;
  docType: 'Syllabus' | 'Past Paper' | 'Lecture Slides';
  content: string;
  structuredPages: Array<{ pageNumber: number; heading: string; text: string }>;
}

export const DEMO_FILES: DemoFileSpec[] = [
  {
    id: 'syllabus',
    filename: 'syll2.pdf',
    type: 'syllabus',
    pages: 2,
    title: 'syll2.pdf',
    docType: 'Syllabus',
    content: `COURSE SYLLABUS: CSE312 Software Architecture & Engineering

Page 1:
Software testing: Verification and validation, Testing concepts - Failure, fault, test case, test suite and test script. Levels of testing, Test plan, Test metrics and coverage, Role of testing - Testing strategies - Black box and white box testing, Unit tests - Integration testing - Top down integration - Bottom up integration - Validation testing - Alpha testing - Beta testing - Other forms of high-level testing - Stress testing - Code inspections - Manual testing - Automated testing - Breaking tests - Regression testing - Test case execution using testing frameworks Examples of testing frame works (Tinderbox, JUnit, PyUnit) and test automation tools (Selenium, Cucumber).

Software Project Management: Cost estimation - Project scheduling - Staffing - Software configuration management - Quality assurance - Software quality models - Project Monitoring - Risk management, etc.

Emerging Trends in Software Engineering: Observing software engineering trends - Identifying "Soft trends" - Technology directions - Tools related trends.

Text Book / References:
1. Roger S Pressman, Software Engineering: A Practitioner's Approach, McGraw-Hill Higher Education, 7th Edition.
2. Ian Sommerville, Software Engineering, Pearson Education, 9th Edition.
3. Paul, C., & Jorgensen, D. (2021). Software Testing: A Craftsman's Approach. Auerbach Publishers, Incorporated.
4. Mark; Ford Richards Neal. (2020). Fundamentals of software architecture: an engineering approach. O'Reilly

Page 2:
Syllabus
Introduction to software engineering: Scope and necessity of software engineering - Evolution of software design techniques - Recent challenges in software industry.

Software life cycle model: Need for software life cycle model - Different life cycle models - Waterfall model - Iterative waterfall model - Prototyping model - Evolutionary model - Spiral model - Agile development methodologies - Rational unified process (RUP) - Extreme Programming (XP).

Requirement analysis and specification: Requirements engineering - Types of system requirements - Role of system analyst - Software requirement specification, - Formal requirement specification IEEE standard.

Architecture and Design: Architectural Styles - Layered architecture, Pipes and Filters, Blackboard, Broker, MVC, MVVM, Micro-Kernel, Micro-Service, Master-Slave, PAC. Design concepts, Coupling and cohesion, Design methodologies - Function Oriented design, UML and Object Oriented design System Design: System modeling - Unified modeling language (UML) - Design Challenges - Design Practices - Top-down and bottom-up design - Experimental prototyping - Collaborative design.

Basic concepts in user interface design: Characteristics of a user interface - Types of user interfaces - Component based graphical user interface design.`,
    structuredPages: [
      {
        pageNumber: 1,
        heading: 'Software Testing, Project Management & References',
        text: `Software testing: Verification and validation, Testing concepts - Failure, fault, test case, test suite and test script. Levels of testing, Test plan, Test metrics and coverage, Role of testing - Testing strategies - Black box and white box testing, Unit tests - Integration testing - Top down integration - Bottom up integration - Validation testing - Alpha testing - Beta testing - Other forms of high-level testing - Stress testing - Code inspections - Manual testing - Automated testing - Breaking tests - Regression testing - Test case execution using testing frameworks Examples of testing frame works (Tinderbox, JUnit, PyUnit) and test automation tools (Selenium, Cucumber).

Software Project Management: Cost estimation - Project scheduling - Staffing - Software configuration management - Quality assurance - Software quality models - Project Monitoring - Risk management, etc.

Emerging Trends in Software Engineering: Observing software engineering trends - Identifying "Soft trends" - Technology directions - Tools related trends.

Text Book / References:
1. Roger S Pressman, Software Engineering: A Practitioner's Approach, McGraw-Hill Higher Education, 7th Edition.
2. Ian Sommerville, Software Engineering, Pearson Education, 9th Edition.
3. Paul, C., & Jorgensen, D. (2021). Software Testing: A Craftsman's Approach. Auerbach Publishers, Incorporated.
4. Mark; Ford Richards Neal. (2020). Fundamentals of software architecture: an engineering approach. O'Reilly`,
      },
      {
        pageNumber: 2,
        heading: 'Course Units: Life Cycle Models, Requirements Engineering & Architecture Styles',
        text: `Syllabus
Introduction to software engineering: Scope and necessity of software engineering - Evolution of software design techniques - Recent challenges in software industry.

Software life cycle model: Need for software life cycle model - Different life cycle models - Waterfall model - Iterative waterfall model - Prototyping model - Evolutionary model - Spiral model - Agile development methodologies - Rational unified process (RUP) - Extreme Programming (XP).

Requirement analysis and specification: Requirements engineering - Types of system requirements - Role of system analyst - Software requirement specification, - Formal requirement specification IEEE standard.

Architecture and Design: Architectural Styles - Layered architecture, Pipes and Filters, Blackboard, Broker, MVC, MVVM, Micro-Kernel, Micro-Service, Master-Slave, PAC. Design concepts, Coupling and cohesion, Design methodologies - Function Oriented design, UML and Object Oriented design System Design: System modeling - Unified modeling language (UML) - Design Challenges - Design Practices - Top-down and bottom-up design - Experimental prototyping - Collaborative design.

Basic concepts in user interface design: Characteristics of a user interface - Types of user interfaces - Component based graphical user interface design.`,
      },
    ],
  },
  {
    id: 'pyq',
    filename: 'Mid Sem 2025.pdf',
    type: 'previous_year_question_paper',
    pages: 2,
    totalMarks: 50,
    year: 2025,
    title: 'Mid Sem 2025.pdf',
    docType: 'Past Paper',
    content: `INDIAN INSTITUTE OF INFORMATION TECHNOLOGY KOTTAYAM
Department of Computer Science and Engineering
MID SEMESTER EXAMINATION - October 2025
COURSE TITLE: CSE312 Software Architecture: Principles and Practices
Time: 15/10/25, 2.30 PM - 4.00 PM | Max. Marks: 50 | Batch: I, II, III

Answer All Questions

1. For the development of a large-scale defense simulation software where the requirements are initially unclear, frequent changes are expected, and the project involves high technical and management risks.
a) Suggest the most appropriate generic software process development model. Justify your answer by referring to how the model handles evolving requirements and risk management. (5 Marks)
b) Draw a diagram and represent the different stages of the software development process based on the model you have suggested above. Explain the significance of each labeled phase in the model and how it is related to project risk, iteration progress, and effort. (5 Marks)

2. While defining system quality attributes such as performance and reliability, which metrics would you use to express these non-functional requirements? (5 marks)

3. A university plans to implement a Smart Campus Management System (SCMS) that integrates student attendance, digital ID cards, timetable scheduling, and automated fee payment modules. The system must support mobile access for students and staff.
a) As part of the Software Requirements Specification (SRS), perform a feasibility study highlighting the technical feasibility of implementing the SCMS in an educational institution. (5 Marks)
b) Prepare the SRS (only outline) for the proposed system, clearly describing the scope, objectives, and constraints of the Smart Campus Management System. (5 Marks)

4. You are gathering requirements for an Online Shopping System. One of the key functions is "Place Customer Order." Develop a form-based specification for this function with fields like Description, Inputs, Outputs, Preconditions, Postconditions, and Side Effects. (5 marks)

5. A distributed cloud-based file storage system is being developed to allow users to upload, access, and share files across multiple locations and devices.
The system includes a central coordination component responsible for managing communication between clients and services. This component handles service registration, request forwarding, and discovery of available services.
The design requirements specify that the system should:
- Support heterogeneous clients (desktop apps, mobile apps, and web browsers).
- Allow clients to interact with remote services (such as storage, search, and indexing) without knowing their physical locations.
- Enable new services (e.g., virus scanning or AI-based tagging) to be added without affecting existing clients.

a) Identify a suitable software architecture pattern for this distributed system and justify your choice based on how it meets the above design goals. (5 Marks)
b) Draw a labeled architecture diagram for the chosen pattern, showing the main components and their interactions. (5 Marks)
c) Discuss how this architecture supports the following quality attributes:
- Maintainability
- Scalability
- Interoperability (5 Marks)
d) Discuss the advantages and limitations of the architecture you have selected for the distributed file storage system. (5 Marks)

********All the Best********`,
    structuredPages: [
      {
        pageNumber: 1,
        heading: 'Questions 1 to 3 (Process Models, Quality Metrics, Feasibility & SRS)',
        text: `INDIAN INSTITUTE OF INFORMATION TECHNOLOGY KOTTAYAM
Department of Computer Science and Engineering
MID SEMESTER EXAMINATION - October 2025
COURSE TITLE: CSE312 Software Architecture: Principles and Practices
Time: 15/10/25, 2.30 PM - 4.00 PM | Max. Marks: 50 | Batch: I, II, III

Answer All Questions

1. For the development of a large-scale defense simulation software where the requirements are initially unclear, frequent changes are expected, and the project involves high technical and management risks.
a) Suggest the most appropriate generic software process development model. Justify your answer by referring to how the model handles evolving requirements and risk management. (5 Marks)
b) Draw a diagram and represent the different stages of the software development process based on the model you have suggested above. Explain the significance of each labeled phase in the model and how it is related to project risk, iteration progress, and effort. (5 Marks)

2. While defining system quality attributes such as performance and reliability, which metrics would you use to express these non-functional requirements? (5 marks)

3. A university plans to implement a Smart Campus Management System (SCMS) that integrates student attendance, digital ID cards, timetable scheduling, and automated fee payment modules. The system must support mobile access for students and staff.
a) As part of the Software Requirements Specification (SRS), perform a feasibility study highlighting the technical feasibility of implementing the SCMS in an educational institution. (5 Marks)
b) Prepare the SRS (only outline) for the proposed system, clearly describing the scope, objectives, and constraints of the Smart Campus Management System. (5 Marks)`,
      },
      {
        pageNumber: 2,
        heading: 'Questions 4 to 5 (Form-based Specification & Broker Architecture Pattern)',
        text: `4. You are gathering requirements for an Online Shopping System. One of the key functions is "Place Customer Order." Develop a form-based specification for this function with fields like Description, Inputs, Outputs, Preconditions, Postconditions, and Side Effects. (5 marks)

5. A distributed cloud-based file storage system is being developed to allow users to upload, access, and share files across multiple locations and devices.
The system includes a central coordination component responsible for managing communication between clients and services. This component handles service registration, request forwarding, and discovery of available services.
The design requirements specify that the system should:
- Support heterogeneous clients (desktop apps, mobile apps, and web browsers).
- Allow clients to interact with remote services (such as storage, search, and indexing) without knowing their physical locations.
- Enable new services (e.g., virus scanning or AI-based tagging) to be added without affecting existing clients.

a) Identify a suitable software architecture pattern for this distributed system and justify your choice based on how it meets the above design goals. (5 Marks)
b) Draw a labeled architecture diagram for the chosen pattern, showing the main components and their interactions. (5 Marks)
c) Discuss how this architecture supports the following quality attributes:
- Maintainability
- Scalability
- Interoperability (5 Marks)
d) Discuss the advantages and limitations of the architecture you have selected for the distributed file storage system. (5 Marks)

********All the Best********`,
      },
    ],
  },
  {
    id: 'lecture',
    filename: 'Lect3.Agile SW Dev (3).pptx',
    type: 'lecture_slides',
    slides: 57,
    title: 'Lect3.Agile SW Dev (3).pptx',
    docType: 'Lecture Slides',
    content: `=== Slide 1: Lecture 3: Agile Software Development ===
CSE312: Software Architecture & Engineering
Topics: Agile principles, Extreme Programming (XP), Scrum, Waterfall comparison, and Testing automation.

=== Slide 3: Agile Principles & Rapid Software Development ===
Agile Development methodologies focus on iterative delivery, customer collaboration, responding to change, and individuals and interactions over processes and tools.

=== Slide 5: Waterfall Model Comparison ===
Waterfall model involves sequential phases: Requirements, Design, Implementation, Verification, Maintenance. Contrasts with agile iterations.

=== Slide 12: Plan-driven vs Agile Processes ===
Detailed breakdown of plan-based waterfall workflows versus adaptive incremental agile cycles.

=== Slide 23: Extreme Programming (XP) ===
XP practices: Pair programming, Test-Driven Development (TDD), continuous integration, small releases, and sustainable pace.

=== Slide 26: Testing in XP and Test Automation ===
Automated unit testing, test-first development, regression testing suites (JUnit, PyUnit).

=== Slide 42: Scrum Framework ===
Scrum roles (Product Owner, Scrum Master, Developers), artifacts (Product Backlog, Sprint Backlog, Increment), and events (Sprint Planning, Daily Scrum, Sprint Review, Retrospective).

=== Slide 53: Agile Scalability and Limitations ===
Challenges with scaling agile to large organizations, distributed teams, and safety-critical systems.`,
    structuredPages: [
      {
        pageNumber: 3,
        heading: 'Slide 3: Agile Principles & Rapid Software Development',
        text: 'Agile Development methodologies focus on iterative delivery, customer collaboration, responding to change, and individuals and interactions over processes and tools.',
      },
      {
        pageNumber: 5,
        heading: 'Slide 5: Waterfall Model Comparison',
        text: 'Waterfall model involves sequential phases: Requirements, Design, Implementation, Verification, Maintenance. Contrasts with agile iterations.',
      },
      {
        pageNumber: 23,
        heading: 'Slide 23: Extreme Programming (XP) Core Practices',
        text: 'XP practices: Pair programming, Test-Driven Development (TDD), continuous integration, small releases, and sustainable pace.',
      },
      {
        pageNumber: 26,
        heading: 'Slide 26: Test-Driven Development and Test Automation',
        text: 'Automated unit testing, test-first development, regression testing suites (JUnit, PyUnit).',
      },
      {
        pageNumber: 42,
        heading: 'Slide 42: Scrum Framework & Agile Project Management',
        text: 'Scrum roles (Product Owner, Scrum Master, Developers), artifacts (Product Backlog, Sprint Backlog, Increment), and events (Sprint Planning, Daily Scrum, Sprint Review, Retrospective).',
      },
      {
        pageNumber: 53,
        heading: 'Slide 53: Agile Scalability and Limitations',
        text: 'Challenges with scaling agile to large organizations, distributed teams, and safety-critical systems.',
      },
    ],
  },
  {
    id: 'requirements_lecture',
    filename: 'Lect4.Req Eng (3).pptx',
    type: 'lecture_slides',
    slides: 87,
    title: 'Lect4.Req Eng (3).pptx',
    docType: 'Lecture Slides',
    content: `=== Slide 1: Lecture 4: Requirements Engineering ===
CSE312: Requirements Analysis, Quality Metrics, Specification Techniques & Feasibility.

=== Slide 14: Non-Functional Requirements Classification ===
Product requirements, organizational requirements, external requirements. Performance, reliability, usability, and security.

=== Slide 19: Non-Functional Requirements Metrics ===
Specifying quantitative metrics for non-functional requirements:
- Speed: Processed transactions/sec, response time, screen refresh time.
- Size: Mbytes, number of ROM chips.
- Ease of use: Training time, number of help frames.
- Reliability: Mean time to failure (MTTF), probability of unavailability, rate of failure occurrence (ROCOF), availability.
- Robustness: Time to restart after failure, percentage of events causing failure.
- Portability: Percentage of target-dependent statements, number of target systems.

=== Slide 26: Metrics for Performance and Reliability ===
Summary Table of Metrics for NFRs:
- Performance: Response time (ms), Throughput (transactions/second), Resource utilization (CPU/Memory %).
- Reliability: MTTF (Mean Time To Failure), MTTR (Mean Time To Repair), Availability (uptime %).

=== Slide 50: Requirements Specification & Feasibility Study ===
Feasibility study investigates whether the system will be technically feasible, cost-effective, and aligned with business objectives.

=== Slide 57: Form-based Requirements Specification ===
Structured form-based specification technique: Defines standard fields for functions including Function Name, Description, Inputs, Outputs, Preconditions, Postconditions, and Side Effects.

=== Slide 58: Example Form-based Specification: Order Processing ===
Function: Place Customer Order
Description: Accepts customer order details, validates inventory, and processes payment.
Inputs: Customer ID, Item List, Payment Info, Shipping Address.
Outputs: Order Confirmation ID, Invoice, Status code.
Preconditions: Customer is authenticated; items exist in active catalog.
Postconditions: Order is stored in database; inventory is reserved; transaction recorded.
Side Effects: Sends confirmation email, updates sales analytics.

=== Slide 65: Software Requirements Specification (SRS) IEEE Outline ===
1. Introduction: Scope, Objectives, Definitions, References.
2. Overall Description: Product perspective, user characteristics, constraints.
3. Specific Requirements: Functional and Non-functional requirements.

=== Slide 72: Technical Feasibility Study Guidelines ===
Evaluating technical feasibility: Available technology, hardware/software infrastructure, developer skillset, integration risks.`,
    structuredPages: [
      {
        pageNumber: 19,
        heading: 'Slide 19: Non-Functional Requirements Metrics & Quantification',
        text: 'Specifying quantitative metrics for NFRs: Speed (transactions/sec, response time), Reliability (MTTF, availability, ROCOF), Size, Ease of Use, Portability.',
      },
      {
        pageNumber: 26,
        heading: 'Slide 26: System Quality Metrics for Performance & Reliability',
        text: 'Metrics for expressing NFRs:\n- Performance: Response time, throughput (transactions/sec), resource utilization.\n- Reliability: Mean Time To Failure (MTTF), Mean Time To Repair (MTTR), Availability (%)',
      },
      {
        pageNumber: 58,
        heading: 'Slide 58: Form-based Requirements Specification - Place Customer Order',
        text: 'Form-based specification template with Description, Inputs, Outputs, Preconditions, Postconditions, and Side Effects for Place Customer Order function.',
      },
      {
        pageNumber: 65,
        heading: 'Slide 65: SRS Outline & Structure (Scope, Objectives, Constraints)',
        text: 'IEEE Software Requirements Specification outline detailing Scope, Objectives, Product Perspective, Constraints, and Functional Requirements.',
      },
      {
        pageNumber: 72,
        heading: 'Slide 72: Technical Feasibility Study Guidelines for Systems',
        text: 'Assessing technical feasibility: Architecture feasibility, hardware/software infrastructure, mobile client compatibility, and institutional network integration.',
      },
    ],
  },
];

export interface DemoTopicSpec {
  id: string;
  name: string;
  priority: number;
  weightage: number; // calculated percentage of marks
  marks: number;
  questionCount: number;
  source: string;
  priorityLevel: 'high' | 'medium' | 'unassessed';
  rankingBasis: string;
  syllabusPage: number;
  syllabusAlignment: 'direct' | 'related';
  lectureNote?: string;
  lectureSource?: {
    documentTitle: string;
    slideRange: string;
    sectionTitle: string;
    slideSnippet: string;
  };
}

export const DEMO_TOPICS: DemoTopicSpec[] = [
  {
    id: 'topic-05',
    name: 'Broker Architecture Pattern',
    priority: 10,
    weightage: 40.0,
    marks: 20,
    questionCount: 4,
    source: 'syllabus',
    priorityLevel: 'high',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 2,
    syllabusAlignment: 'direct',
    lectureNote: 'Architecture pattern inferred from distributed coordination requirements; syllabus Page 2 direct match',
    lectureSource: {
      documentTitle: 'syll2.pdf (Syllabus)',
      slideRange: 'Page 2',
      sectionTitle: 'Architecture and Design · Architectural Styles',
      slideSnippet: 'Architectural Styles - Layered architecture, Pipes and Filters, Blackboard, Broker, MVC, MVVM, Micro-Kernel, Micro-Service, Master-Slave, PAC.',
    },
  },
  {
    id: 'topic-01',
    name: 'Spiral Model and Risk Management',
    priority: 9,
    weightage: 20.0,
    marks: 10,
    questionCount: 2,
    source: 'syllabus',
    priorityLevel: 'high',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 2,
    syllabusAlignment: 'direct',
    lectureNote: 'Syllabus Page 2 direct match (Life cycle models)',
    lectureSource: {
      documentTitle: 'syll2.pdf (Syllabus)',
      slideRange: 'Page 2',
      sectionTitle: 'Software life cycle model',
      slideSnippet: 'Software life cycle model: Need for software life cycle model - Different life cycle models - Waterfall model - Iterative waterfall model - Prototyping model - Evolutionary model - Spiral model - Agile development methodologies.',
    },
  },
  {
    id: 'topic-03',
    name: 'Feasibility Study and Software Requirements Specification',
    priority: 9,
    weightage: 20.0,
    marks: 10,
    questionCount: 2,
    source: 'syllabus',
    priorityLevel: 'high',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 2,
    syllabusAlignment: 'related',
    lectureSource: {
      documentTitle: 'Lect4.Req Eng (3).pptx',
      slideRange: 'Slides 65–69, 72',
      sectionTitle: 'SRS Outline & Technical Feasibility',
      slideSnippet: 'SRS outline covering Scope, Objectives, Constraints (Slide 65); Technical feasibility evaluation for institutional systems (Slide 72).',
    },
  },
  {
    id: 'topic-02',
    name: 'Non-functional Requirements and Quality Metrics',
    priority: 7,
    weightage: 10.0,
    marks: 5,
    questionCount: 1,
    source: 'syllabus',
    priorityLevel: 'medium',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 2,
    syllabusAlignment: 'related',
    lectureSource: {
      documentTitle: 'Lect4.Req Eng (3).pptx',
      slideRange: 'Slide 26 (Slides 19–26)',
      sectionTitle: 'Quality Metrics for Performance & Reliability',
      slideSnippet: 'Metrics for expressing NFRs: Performance (response time, throughput), Reliability (MTTF, MTTR, Availability %, failure rates).',
    },
  },
  {
    id: 'topic-04',
    name: 'Form-based Requirements Specification',
    priority: 7,
    weightage: 10.0,
    marks: 5,
    questionCount: 1,
    source: 'syllabus',
    priorityLevel: 'medium',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 2,
    syllabusAlignment: 'related',
    lectureSource: {
      documentTitle: 'Lect4.Req Eng (3).pptx',
      slideRange: 'Slides 57–60',
      sectionTitle: 'Form-based Specification · Place Customer Order',
      slideSnippet: 'Form-based specification template with Description, Inputs, Outputs, Preconditions, Postconditions, and Side Effects for Place Customer Order function.',
    },
  },
  {
    id: 'topic-06',
    name: 'Agile Development',
    priority: 3,
    weightage: 0.0,
    marks: 0,
    questionCount: 0,
    source: 'syllabus',
    priorityLevel: 'unassessed',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 2,
    syllabusAlignment: 'direct',
    lectureSource: {
      documentTitle: 'Lect3.Agile SW Dev (3).pptx',
      slideRange: 'Slides 3–22, 53',
      sectionTitle: 'Agile Principles & Rapid Delivery',
      slideSnippet: 'Agile Development methodologies focus on iterative delivery, customer collaboration, and rapid response to change.',
    },
  },
  {
    id: 'topic-07',
    name: 'Extreme Programming (XP)',
    priority: 3,
    weightage: 0.0,
    marks: 0,
    questionCount: 0,
    source: 'syllabus',
    priorityLevel: 'unassessed',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 2,
    syllabusAlignment: 'direct',
    lectureSource: {
      documentTitle: 'Lect3.Agile SW Dev (3).pptx',
      slideRange: 'Slides 23–41',
      sectionTitle: 'XP Practices & Pair Programming',
      slideSnippet: 'Extreme Programming core practices: Pair programming, test-driven development, continuous integration, small releases.',
    },
  },
  {
    id: 'topic-08',
    name: 'Scrum and Agile Project Management',
    priority: 3,
    weightage: 0.0,
    marks: 0,
    questionCount: 0,
    source: 'syllabus',
    priorityLevel: 'unassessed',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 2,
    syllabusAlignment: 'related',
    lectureSource: {
      documentTitle: 'Lect3.Agile SW Dev (3).pptx',
      slideRange: 'Slides 42–54',
      sectionTitle: 'Scrum Roles, Artifacts & Ceremonies',
      slideSnippet: 'Scrum roles (Product Owner, Scrum Master, Developers), Sprints, Product Backlog, and Sprint Reviews.',
    },
  },
  {
    id: 'topic-09',
    name: 'Waterfall Model',
    priority: 3,
    weightage: 0.0,
    marks: 0,
    questionCount: 0,
    source: 'syllabus',
    priorityLevel: 'unassessed',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 2,
    syllabusAlignment: 'direct',
    lectureSource: {
      documentTitle: 'Lect3.Agile SW Dev (3).pptx',
      slideRange: 'Slides 5–6, 12–21',
      sectionTitle: 'Waterfall Model Comparison',
      slideSnippet: 'Sequential lifecycle phases: Requirements, Design, Implementation, Verification, Maintenance.',
    },
  },
  {
    id: 'topic-10',
    name: 'Software Testing and Test Automation',
    priority: 3,
    weightage: 0.0,
    marks: 0,
    questionCount: 0,
    source: 'syllabus',
    priorityLevel: 'unassessed',
    rankingBasis: 'Marks in one uploaded 2025 mid-sem paper only',
    syllabusPage: 1,
    syllabusAlignment: 'related',
    lectureSource: {
      documentTitle: 'Lect3.Agile SW Dev (3).pptx',
      slideRange: 'Slides 26–27, 36–41',
      sectionTitle: 'Testing Frameworks & Test Automation',
      slideSnippet: 'Automated testing tools, test case execution, regression testing, and JUnit/PyUnit frameworks.',
    },
  },
];

export interface DemoQuestionSpec {
  id: string;
  questionNumber: string;
  subpart?: string;
  marks: number;
  pageNumber: number;
  topicId: string;
  topicName: string;
  questionText: string;
  summary: string;
  lectureMatch?: string;
}

export const DEMO_QUESTIONS: DemoQuestionSpec[] = [
  {
    id: 'Q1a',
    questionNumber: '1',
    subpart: 'a',
    marks: 5,
    pageNumber: 1,
    topicId: 'topic-01',
    topicName: 'Spiral Model and Risk Management',
    questionText: 'For the development of a large-scale defense simulation software where the requirements are initially unclear, frequent changes are expected, and the project involves high technical and management risks: Suggest the most appropriate generic software process development model. Justify your answer by referring to how the model handles evolving requirements and risk management. (5 Marks)',
    summary: 'Select software process model for unclear requirements and high risks; justify',
  },
  {
    id: 'Q1b',
    questionNumber: '1',
    subpart: 'b',
    marks: 5,
    pageNumber: 1,
    topicId: 'topic-01',
    topicName: 'Spiral Model and Risk Management',
    questionText: 'Draw a diagram and represent the different stages of the software development process based on the model you have suggested above. Explain the significance of each labeled phase in the model and how it is related to project risk, iteration progress, and effort. (5 Marks)',
    summary: 'Draw and explain phases of selected model, including risk, iteration and effort',
  },
  {
    id: 'Q2',
    questionNumber: '2',
    marks: 5,
    pageNumber: 1,
    topicId: 'topic-02',
    topicName: 'Non-functional Requirements and Quality Metrics',
    questionText: 'While defining system quality attributes such as performance and reliability, which metrics would you use to express these non-functional requirements? (5 marks)',
    summary: 'Metrics for performance and reliability non-functional requirements',
    lectureMatch: 'Lect4.Req Eng (3).pptx (Slide 26)',
  },
  {
    id: 'Q3a',
    questionNumber: '3',
    subpart: 'a',
    marks: 5,
    pageNumber: 1,
    topicId: 'topic-03',
    topicName: 'Feasibility Study and Software Requirements Specification',
    questionText: 'A university plans to implement a Smart Campus Management System (SCMS) that integrates student attendance, digital ID cards, timetable scheduling, and automated fee payment modules. The system must support mobile access for students and staff. As part of the Software Requirements Specification (SRS), perform a feasibility study highlighting the technical feasibility of implementing the SCMS in an educational institution. (5 Marks)',
    summary: 'Technical feasibility study for smart campus system',
    lectureMatch: 'Lect4.Req Eng (3).pptx (Slide 72)',
  },
  {
    id: 'Q3b',
    questionNumber: '3',
    subpart: 'b',
    marks: 5,
    pageNumber: 1,
    topicId: 'topic-03',
    topicName: 'Feasibility Study and Software Requirements Specification',
    questionText: 'Prepare the SRS (only outline) for the proposed system, clearly describing the scope, objectives, and constraints of the Smart Campus Management System. (5 Marks)',
    summary: 'SRS outline including scope, objectives and constraints',
    lectureMatch: 'Lect4.Req Eng (3).pptx (Slide 65)',
  },
  {
    id: 'Q4',
    questionNumber: '4',
    marks: 5,
    pageNumber: 2,
    topicId: 'topic-04',
    topicName: 'Form-based Requirements Specification',
    questionText: 'You are gathering requirements for an Online Shopping System. One of the key functions is "Place Customer Order." Develop a form-based specification for this function with fields like Description, Inputs, Outputs, Preconditions, Postconditions, and Side Effects. (5 marks)',
    summary: 'Form-based specification for Place Customer Order',
    lectureMatch: 'Lect4.Req Eng (3).pptx (Slide 58)',
  },
  {
    id: 'Q5a',
    questionNumber: '5',
    subpart: 'a',
    marks: 5,
    pageNumber: 2,
    topicId: 'topic-05',
    topicName: 'Broker Architecture Pattern',
    questionText: 'A distributed cloud-based file storage system is being developed to allow users to upload, access, and share files across multiple locations and devices. Identify a suitable software architecture pattern for this distributed system and justify your choice based on how it meets the design goals. (5 Marks)',
    summary: 'Identify and justify architecture pattern for distributed file storage',
  },
  {
    id: 'Q5b',
    questionNumber: '5',
    subpart: 'b',
    marks: 5,
    pageNumber: 2,
    topicId: 'topic-05',
    topicName: 'Broker Architecture Pattern',
    questionText: 'Draw a labeled architecture diagram for the chosen pattern, showing the main components and their interactions. (5 Marks)',
    summary: 'Draw labeled architecture diagram',
  },
  {
    id: 'Q5c',
    questionNumber: '5',
    subpart: 'c',
    marks: 5,
    pageNumber: 2,
    topicId: 'topic-05',
    topicName: 'Broker Architecture Pattern',
    questionText: 'Discuss how this architecture supports the following quality attributes: Maintainability, Scalability, Interoperability. (5 Marks)',
    summary: 'Maintainability, scalability and interoperability',
  },
  {
    id: 'Q5d',
    questionNumber: '5',
    subpart: 'd',
    marks: 5,
    pageNumber: 2,
    topicId: 'topic-05',
    topicName: 'Broker Architecture Pattern',
    questionText: 'Discuss the advantages and limitations of the architecture you have selected for the distributed file storage system. (5 Marks)',
    summary: 'Advantages and limitations of architecture',
  },
];

export function isDemoFile(fileNameOrTitle: string): DemoFileSpec | null {
  const norm = (fileNameOrTitle || '').toLowerCase().trim();
  if (!norm) return null;
  if (norm.includes('syll2') || (norm.includes('syll') && norm.endsWith('.pdf'))) {
    return DEMO_FILES.find((f) => f.id === 'syllabus') || null;
  }
  if (norm.includes('mid sem') || norm.includes('2025') || norm.includes('cse312')) {
    return DEMO_FILES.find((f) => f.id === 'pyq') || null;
  }
  if (norm.includes('lect3') || (norm.includes('agile') && norm.includes('sw dev'))) {
    return DEMO_FILES.find((f) => f.id === 'lecture') || null;
  }
  if (norm.includes('lect4') || (norm.includes('req') && norm.includes('eng'))) {
    return DEMO_FILES.find((f) => f.id === 'requirements_lecture') || null;
  }
  return null;
}
