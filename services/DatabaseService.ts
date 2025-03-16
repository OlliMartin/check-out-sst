import { Effect, Context, Stream } from 'effect';
import {Employee} from "../model/employee";

export class Database extends Context.Tag('DatabaseService')<
  Database,
  {
    readonly createEmployees: (employees: Stream.Stream<Employee>) => Effect.Effect<unknown>;
    
    readonly upsertProcess: (processId: string) => Effect.Effect<void>;
    readonly getProcessById: (processId: string) => Effect.Effect<unknown>;
  }
>() {}
