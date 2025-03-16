import { Resource } from 'sst';
import { Context, Effect, Stream } from 'effect';
import { Employee } from '../model/employee';
import { Process } from '../model/process';
import { DatabaseError } from '../model/errors';
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

const { unmarshall } = require('@aws-sdk/util-dynamodb');

export class Database extends Context.Tag('DatabaseService')<
  Database,
  {
    readonly createEmployees: (
      employees: Stream.Stream<Employee>,
    ) => Effect.Effect<unknown, DatabaseError>;

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

export const DynamoDatabase = Database.of({
  createEmployees: employees => Effect.succeed([]),
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

        return Effect.succeed(unmarshall(dbResponse.Item) as Process);
      }),
    ),
});
