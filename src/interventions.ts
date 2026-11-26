import { z } from 'zod'

const vectorSchema = z.object({x:z.number().min(-10000).max(10000),y:z.number().min(-10000).max(10000)})
export const inputSchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('continuous'),vector:vectorSchema}),
  z.object({kind:z.literal('timed'),vector:vectorSchema,start:z.number().nonnegative(),end:z.number().positive()}),
  z.object({kind:z.literal('impulse'),vector:vectorSchema}),
  z.object({kind:z.literal('velocity'),vector:vectorSchema}),
])
export const interventionSchema = z.object({
  bodyId:z.string(),
  tick:z.number().int().nonnegative(),
  time:z.number().nonnegative(),
  input:inputSchema,
  velocityBefore:z.object({x:z.number(),y:z.number()}).optional(),
  velocityAfter:z.object({x:z.number(),y:z.number()}).optional(),
})
export type PhysicalInput = z.infer<typeof inputSchema>
export type Intervention = z.infer<typeof interventionSchema>
export type RunTimeline = {tick:number;events:readonly Intervention[]}
