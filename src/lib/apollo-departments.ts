// Apollo's canonical "Departments & Job Functions" taxonomy.
// Maps the human labels to the slugs Apollo's API expects in
// `person_department_or_subdepartments[]`.
//
// Top-level departments use the `master_<slug>` prefix; sub-departments use
// the plain slug. Slugs are computed with `toSlug()` below — if Apollo rejects
// a specific value we may need to hand-tweak it, but this follows Apollo's
// standard snake_case convention.

export interface DepartmentNode {
  label: string
  value: string // Apollo slug, e.g. "master_engineering_technical" or "software_development"
  children?: DepartmentNode[]
}

function toSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parent(label: string, children: string[], overrideValue?: string): DepartmentNode {
  return {
    label,
    value: overrideValue ?? `master_${toSlug(label)}`,
    children: children.map((c) => ({ label: c, value: toSlug(c) })),
  }
}

export const APOLLO_DEPARTMENTS: DepartmentNode[] = [
  parent(
    'C-Suite',
    [
      'Executive',
      'Finance Executive',
      'Founder',
      'Human Resources Executive',
      'Information Technology Executive',
      'Legal Executive',
      'Marketing Executive',
      'Medical & Health Executive',
      'Operations Executive',
      'Sales Leader',
    ],
    // Parent label changed to "C-Suite" but Apollo's real parent slug is
    // still `master_executive`, so picking this top-level box filters to
    // all executive subdepartments exactly as before.
    'master_executive'
  ),
  parent('Product', ['Product Development', 'Product Management']),
  parent('Engineering & Technical', [
    'Artificial Intelligence / Machine Learning',
    'Bioengineering',
    'Biometrics',
    'Business Intelligence',
    'Chemical Engineering',
    'Cloud / Mobility',
    'Data Science',
    'DevOps',
    'Digital Transformation',
    'Emerging Technology / Innovation',
    'Engineering & Technical',
    'Industrial Engineering',
    'Mechanic',
    'Mobile Development',
    'Project Management',
    'Research & Development',
    'Scrum Master / Agile Coach',
    'Software Development',
    'Support / Technical Services',
    'Technician',
    'Technology Operations',
    'Test / Quality Assurance',
    'UI / UX',
    'Web Development',
  ]),
  parent('Design', ['All Design', 'Product or UI/UX Design', 'Graphic / Visual / Brand Design']),
  parent('Education', ['Teacher', 'Principal', 'Superintendent', 'Professor']),
  parent('Finance', [
    'Accounting',
    'Finance',
    'Financial Planning & Analysis',
    'Financial Reporting',
    'Financial Strategy',
    'Financial Systems',
    'Internal Audit & Control',
    'Investor Relations',
    'Mergers & Acquisitions',
    'Real Estate Finance',
    'Financial Risk',
    'Shared Services',
    'Sourcing / Procurement',
    'Tax',
    'Treasury',
  ]),
  parent('Human Resources', [
    'Compensation & Benefits',
    'Culture, Diversity & Inclusion',
    'Employee & Labor Relations',
    'Health & Safety',
    'Human Resource Information System',
    'Human Resources',
    'HR Business Partner',
    'Learning & Development',
    'Organizational Development',
    'Recruiting & Talent Acquisition',
    'Talent Management',
    'Workforce Management',
    'People Operations',
  ]),
  parent('Information Technology', [
    'Application Development',
    'Business Service Management / ITSM',
    'Collaboration & Web App',
    'Data Center',
    'Data Warehouse',
    'Database Administration',
    'eCommerce Development',
    'Enterprise Architecture',
    'Help Desk / Desktop Services',
    'HR / Financial / ERP Systems',
    'Information Security',
    'Information Technology',
    'Infrastructure',
    'IT Asset Management',
    'IT Audit / IT Compliance',
    'IT Operations',
    'IT Procurement',
    'IT Strategy',
    'IT Training',
    'Networking',
    'Project & Program Management',
    'Quality Assurance',
    'Retail / Store Systems',
    'Servers',
    'Storage & Disaster Recovery',
    'Telecommunications',
    'Virtualization',
  ]),
  parent('Legal', [
    'Acquisitions',
    'Compliance',
    'Contracts',
    'Corporate Secretary',
    'eDiscovery',
    'Ethics',
    'Governance',
    'Governmental Affairs & Regulatory Law',
    'Intellectual Property & Patent',
    'Labor & Employment',
    'Lawyer / Attorney',
    'Legal',
    'Legal Counsel',
    'Legal Operations',
    'Litigation',
    'Privacy',
  ]),
  parent('Marketing', [
    'Advertising',
    'Brand Management',
    'Content Marketing',
    'Customer Experience',
    'Customer Marketing',
    'Demand Generation',
    'Digital Marketing',
    'eCommerce Marketing',
    'Event Marketing',
    'Field Marketing',
    'Lead Generation',
    'Marketing',
    'Marketing Analytics / Insights',
    'Marketing Communications',
    'Marketing Operations',
    'Product Marketing',
    'Public Relations',
    'Search Engine Optimization / Pay Per Click',
    'Social Media Marketing',
    'Strategic Communications',
    'Technical Marketing',
  ]),
  parent('Medical & Health', [
    'Anesthesiology',
    'Chiropractics',
    'Clinical Systems',
    'Dentistry',
    'Dermatology',
    'Doctors / Physicians',
    'Epidemiology',
    'First Responder',
    'Infectious Disease',
    'Medical Administration',
    'Medical Education & Training',
    'Medical Research',
    'Medicine',
    'Neurology',
    'Nursing',
    'Nutrition & Dietetics',
    'Obstetrics / Gynecology',
    'Oncology',
    'Opthalmology',
    'Optometry',
    'Orthopedics',
    'Pathology',
    'Pediatrics',
    'Pharmacy',
    'Physical Therapy',
    'Psychiatry',
    'Psychology',
    'Public Health',
    'Radiology',
    'Social Work',
  ]),
  parent('Operations', [
    'Call Center',
    'Construction',
    'Corporate Strategy',
    'Customer Service / Support',
    'Enterprise Resource Planning',
    'Facilities Management',
    'Leasing',
    'Logistics',
    'Office Operations',
    'Operations',
    'Physical Security',
    'Project Development',
    'Quality Management',
    'Real Estate',
    'Safety',
    'Store Operations',
    'Supply Chain',
  ]),
  parent('Sales', [
    'Account Management',
    'Business Development',
    'Channel Sales',
    'Customer Retention & Development',
    'Customer Success',
    'Field / Outside Sales',
    'Inside Sales',
    'Partnerships',
    'Revenue Operations',
    'Sales',
    'Sales Enablement',
    'Sales Engineering',
    'Sales Operations',
    'Sales Training',
  ]),
  parent('Consulting', ['Consultant']),
]

// Flat map from slug → human label, for re-rendering chips from saved filter state.
export const DEPARTMENT_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const dept of APOLLO_DEPARTMENTS) {
    map[dept.value] = dept.label
    for (const child of dept.children || []) {
      map[child.value] = child.label
    }
  }
  return map
})()

export function departmentLabel(value: string): string {
  return DEPARTMENT_LABELS[value] || value
}
