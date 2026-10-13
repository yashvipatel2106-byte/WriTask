const DEPARTMENTS = [
  "Engineering",
  "Design",
  "Product",
  "Marketing",
  "Operations",
  "HR",
];

function isValidDepartment(value) {
  return DEPARTMENTS.includes(value);
}

module.exports = { DEPARTMENTS, isValidDepartment };
