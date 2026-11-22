const functions:Record<string,(x:number)=>number>={
  sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,
  sqrt:Math.sqrt,abs:Math.abs,exp:Math.exp,log:Math.log,ln:Math.log,log10:Math.log10,
  floor:Math.floor,ceil:Math.ceil,
}

export function compileExpression(source:string,variables:readonly string[]) {
  if(source.length>240)throw new Error('表达式最多 240 个字符。')
  const tokens=source.replaceAll('π','pi').replaceAll('θ','theta')
    .match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z][a-zA-Z0-9]*|[^\s]/g)??[]
  type Expression=(values:readonly number[])=>number
  let cursor=0
  const next=()=>tokens[cursor++]
  function close() {
    if(next()!==')')throw new Error('表达式缺少右括号。')
  }
  function atom():Expression {
    const token=next()
    if(token==='(') {
      const value=parse(0)
      close()
      return value
    }
    if(token==='-'||token==='+') {
      const value=parse(3)
      return values=>token==='-'?-value(values):value(values)
    }
    if(token==='pi'||token==='e')return ()=>token==='pi'?Math.PI:Math.E
    const index=variables.indexOf(token)
    if(index!==-1)return values=>values[index]
    if(token&&/^\d|^\./.test(token)&&Number.isFinite(Number(token)))return ()=>Number(token)
    if(Object.hasOwn(functions,token)&&next()==='(') {
      const value=parse(0)
      close()
      return values=>functions[token](value(values))
    }
    throw new Error(token?'无法识别「'+token+'」。乘法请写 *。':'请输入完整的数学表达式。')
  }
  function parse(minimum:number):Expression {
    let result=atom()
    while(cursor<tokens.length) {
      const op=tokens[cursor]
      const priority=op==='+'||op==='-'?1:op==='*'||op==='/'?2:op==='^'?3:0
      if(!priority||priority<minimum)break
      next()
      const left=result,right=parse(priority+(op==='^'?0:1))
      result=values=>{
        const a=left(values), b=right(values)
        switch(op) {
          case '+':return a+b
          case '-':return a-b
          case '*':return a*b
          case '/':return a/b
          default:return a**b
        }
      }
    }
    return result
  }
  const evaluate=parse(0)
  if(cursor!==tokens.length)throw new Error('表达式存在多余符号。乘法请写 *。')
  return (...values:number[])=>evaluate(values)
}
