import {Effect, Exit} from 'effect';

const createEmployeesEffect = () => {
  return Effect.gen(function* () {
    return yield* Effect.succeed("abc")
  });
}

export async function createEmployees(event) {
  console.log(event);
  
  const employeeResult = await Effect.runPromiseExit(
    createEmployeesEffect()  
  );

  return Exit.match({
    onSuccess: (res) => ({
      statusCode: 200,
      body: res,
    }),
    onFailure: (err) => ({
      statusCode: 500
    })
  })
}
