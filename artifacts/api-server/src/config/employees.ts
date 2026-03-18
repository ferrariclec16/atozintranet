export interface Employee {
  username: string;
  password: string;
  displayName: string;
  role: string;
}

export const employees: Employee[] = [
  {
    username: "admin",
    password: "admin1234",
    displayName: "관리자",
    role: "admin",
  },
  {
    username: "employee1",
    password: "pass1234",
    displayName: "직원 1",
    role: "employee",
  },
  {
    username: "employee2",
    password: "pass1234",
    displayName: "직원 2",
    role: "employee",
  },
  {
    username: "employee3",
    password: "pass1234",
    displayName: "직원 3",
    role: "employee",
  },
  {
    username: "employee4",
    password: "pass1234",
    displayName: "직원 4",
    role: "employee",
  },
  {
    username: "employee5",
    password: "pass1234",
    displayName: "직원 5",
    role: "employee",
  },
  {
    username: "employee6",
    password: "pass1234",
    displayName: "직원 6",
    role: "employee",
  },
];
