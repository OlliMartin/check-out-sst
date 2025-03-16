import { Resource } from "sst";

export async function upload() {
  return {
    statusCode: 200,
    body: 'abc',
  };
}

export async function latest() {
    return {
        statusCode: 200,
        body: 'def',
    };
}