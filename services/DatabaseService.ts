import { Resource } from 'sst';
import { Context, Effect, Stream } from 'effect';
import { Employee } from '../model/employee';
import { Process } from '../model/process';
import { DatabaseError, NotUniqueError } from '../model/errors';
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

import { unmarshall } from '@aws-sdk/util-dynamodb';

/* Generally the error handling should be improved, especially when serializing them to an API response */

export class Database extends Context.Tag('DatabaseService')<
  Database,
  {
    readonly createEmployees: (
      tenantId: string,
      employees: Stream.Stream<Employee>,
    ) => Effect.Effect<Stream.Stream<Employee, NotUniqueError>, DatabaseError>;

    readonly upsertProcess: (
      process: Process,
    ) => Effect.Effect<Process, DatabaseError>;

    readonly getProcessById: (
      tenantId: string,
      processId: string,
    ) => Effect.Effect<Process, DatabaseError>;
  }
>() {}

const client = new DynamoDBClient();

const createEmployeesEffect = (
  tenantId: string,
  employees: Stream.Stream<Employee>,
): Effect.Effect<Stream.Stream<Employee, NotUniqueError>, DatabaseError> => {
  return Effect.gen(function* () {
    /* 
        Not implementing the BulkInsert and evaluation since I'm already quite over the 6 hours.
        
        The idea:
    
        Use Bulk Insert to store 50 (100?) records at a time - this can be called concurrently. (16 fibers should fit into a 128 mbyte lambda)
        With an index on phone-number+tenant-id uniqueness can be guaranteed.
        If dynamo rejects a record transform it into a NotUniqueError.
        The lambda is built in a way that it can distinguish between the different error types and update the process accordingly.
        -> #Successful: Count, Duplicates: [$id1, $id2, ..], InvalidPhoneNumbers: [$id100, $id101, ..] 
    */

    return employees;
  });
};

export const DynamoDatabase = Database.of({
  createEmployees: createEmployeesEffect,
  upsertProcess: (process: Process) =>
    Effect.tryPromise({
      try: (signal: AbortSignal) => {
        return (
          client
            .send(
              new UpdateItemCommand({
                TableName: Resource.Processes.name,
                Key: {
                  processId: {
                    S: process.identifier,
                  },
                  tenantId: {
                    S: process.tenantId,
                  },
                },
                ExpressionAttributeNames: {
                  '#tc': 'totalRecords',
                  '#pc': 'processedRecords',
                  '#sa': 'startedAt',
                  '#fa': 'finishedAt',
                },
                ExpressionAttributeValues: {
                  ':tc': {
                    N: '' + process.totalRecords,
                  },
                  ':pc': {
                    N: '' + (process.processedRecords ?? 0),
                  },
                  ':sa': {
                    N: '' + (process.startedAt ?? 0),
                  },
                  ':fa': {
                    N: '' + (process.finishedAt ?? 0),
                  },
                },
                UpdateExpression:
                  'SET #tc = :tc, #pc = :pc, #sa = :sa, #fa = :fa',
              }),
              { abortSignal: signal },
            )
            /* Handle dynamo response, conditionally raise error */
            .then(res => process)
        );
      },
      catch: err =>
        new DatabaseError({
          message: 'An unexpected database error occured.',
          innerError: err,
          type: 'unexpected',
        }),
    }),
  getProcessById: (tenantId, processId) =>
    Effect.tryPromise({
      try: async signal =>
        client.send(
          new GetItemCommand({
            TableName: Resource.Processes.name,
            Key: {
              processId: {
                S: processId,
              },
              tenantId: {
                S: tenantId,
              },
            },
          }),
          { abortSignal: signal },
        ),
      catch: err =>
        new DatabaseError({
          message: 'An unexpected database error occured.',
          innerError: err,
          type: 'unexpected',
        }),
    }).pipe(
      Effect.andThen(dbResponse => {
        if (!dbResponse.Item) {
          return Effect.fail(
            new DatabaseError({
              message: `Could not find process ${processId}.`,
              type: 'record-not-found',
            }),
          );
        }

        // Should use effect Schema.decodeUnknown instead of just trusting the validity of the data.
        // On error can return a unexpected error (DatabaseError)
        return Effect.succeed(unmarshall(dbResponse.Item) as Process);
      }),
    ),
});
