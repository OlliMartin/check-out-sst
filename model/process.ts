export class Process {
  public tenantId: string;

  public identifier: string;

  public totalRecords: number;

  public processedRecords?: number;

  public startedAt?: number;

  public finishedAt?: number;

  constructor(tenantId: string, identifier: string, totalRecords: number) {
    this.tenantId = tenantId;
    this.identifier = identifier;
    this.totalRecords = totalRecords;
  }
}
