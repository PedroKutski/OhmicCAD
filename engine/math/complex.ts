export class Complex {
  constructor(public real: number, public imag: number) {}

  static get ZERO(): Complex { return new Complex(0, 0); }

  add(c: Complex): Complex {
    return new Complex(this.real + c.real, this.imag + c.imag);
  }

  sub(c: Complex): Complex {
    return new Complex(this.real - c.real, this.imag - c.imag);
  }

  mul(c: Complex): Complex {
    return new Complex(
      this.real * c.real - this.imag * c.imag,
      this.real * c.imag + this.imag * c.real
    );
  }

  div(c: Complex): Complex {
    const den = c.real * c.real + c.imag * c.imag;
    return new Complex(
      (this.real * c.real + this.imag * c.imag) / den,
      (this.imag * c.real - this.real * c.imag) / den
    );
  }

  get magnitude(): number {
    return Math.sqrt(this.real * this.real + this.imag * this.imag);
  }

  get phase(): number {
    return Math.atan2(this.imag, this.real);
  }
}
