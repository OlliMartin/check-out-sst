import { Schema } from 'effect';

export const EmployeeSchema = Schema.Struct({
  employeeId: Schema.String, // TODO: Change to GUID
  firstName: Schema.String,
  lastName: Schema.String,
  phoneNumber: Schema.String,
});

export type Employee = Schema.Schema.Type<typeof EmployeeSchema>;