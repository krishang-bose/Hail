export type Company = {
  id: string;
  name: string;
  website: string;
  logo_url: string | null;
  description: string;
  mission: string;
  industry: string;
  recent_news: string[];
  technologies: string[];
  created_at: string;
};

export type PersonCategory = 'founder' | 'cto' | 'engineer' | 'recruiter';

export type Person = {
  id: string;
  company_id: string;
  name: string;
  role: string;
  email: string | null;
  linkedin_url: string;
  bio: string;
  previous_experience: string;
  category: PersonCategory;
};

export type Message = {
  id: string;
  company_id: string;
  person_id: string;
  user_goal: string;
  generated_text: {
    linkedin: string;
    email: string;
  };
  created_at: string;
};

export type CompanyWithPeople = Company & {
  people: Person[];
};

export type TreeNode = {
  id: string;
  name: string;
  role: string;
  category: PersonCategory | 'company';
  children?: TreeNode[];
  data?: Person;
};
