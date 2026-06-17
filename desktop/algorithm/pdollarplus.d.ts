export class Point {
  constructor(x: number, y: number, id: number, angle?: number);
  X: number;
  Y: number;
  ID: number;
  Angle: number;
}

export interface RecognitionResult {
  Name: string;
  Score: number;
  Time: number;
}

export class PDollarPlusRecognizer {
  Recognize(points: Point[]): RecognitionResult;
  AddGesture(name: string, points: Point[]): number;
  DeleteUserGestures(): number;
}
