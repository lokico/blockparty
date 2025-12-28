import { BaseProps } from './BaseProps'

export interface Props extends BaseProps {
  /**
   * Extended property: Title
   */
  title: string
  /**
   * Extended property: Count
   */
  count?: number
}

export default ({ id, name, title }: Props) => <div>{title}</div>
