
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'

const OrderSuccessPage = () => {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-green-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 flex flex-col items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Check className="w-12 h-12 text-green-600" strokeWidth={3} />
        </div>
        
        <h1 className="text-2xl font-bold text-green-700 text-center">
          Thank you! Your order has been placed successfully.
        </h1>
        
        <p className="text-lg text-gray-700 text-center">
          Your Order ID is: <span className="font-semibold text-gray-900">#{orderId}</span>
        </p>
        
        <Button
          className="w-full mt-4 bg-green-600 hover:bg-green-700"
          onClick={() => navigate('/')}
          size="lg"
        >
          Continue Shopping
        </Button>
      </div>
    </div>
  )
}

export default OrderSuccessPage
