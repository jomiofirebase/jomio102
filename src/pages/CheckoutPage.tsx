
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore } from '@/stores/cartStore'
import { useLocationStore } from '@/stores/locationStore'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, MapPin, Clock, CreditCard, ShoppingBag, Loader2, AlertCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface DeliveryOption {
  type: string
  label: string
  charge: number
  estimated_time?: string
}

const CheckoutPage = () => {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const { items, getSubtotal, clearCart } = useCartStore()
  const { deliveryLat, deliveryLng, deliveryLocationName } = useLocationStore()

  // Form states
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [selectedDeliveryOption, setSelectedDeliveryOption] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  
  // Data states
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([])
  const [deliveryCharge, setDeliveryCharge] = useState(0)
  const [minimumOrderValue, setMinimumOrderValue] = useState(0)
  
  // UI states
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  useEffect(() => {
    // Redirect if no items or location
    if (items.length === 0) {
      navigate('/cart')
      return
    }
    
    if (!deliveryLat || !deliveryLng || !deliveryLocationName) {
      navigate('/set-delivery-location')
      return
    }
    
    // Initialize form with user data if available
    if (user && profile) {
      setCustomerName(profile.full_name || '')
      setCustomerPhone(profile.phone_number || '')
    }
    
    fetchInitialData()
  }, [items.length, deliveryLat, deliveryLng, user, profile, navigate])

  useEffect(() => {
    // Calculate delivery charge for instant delivery
    if (selectedDeliveryOption === 'instant' && deliveryLat && deliveryLng) {
      calculateDeliveryCharge()
    } else {
      setDeliveryCharge(0)
    }
  }, [selectedDeliveryOption, deliveryLat, deliveryLng])

  const fetchInitialData = async () => {
    await Promise.all([
      fetchShopSettings(),
      fetchDeliveryOptions()
    ])
  }

  const fetchShopSettings = async () => {
    try {
      console.log('Fetching shop settings...')
      const { data, error } = await supabase
        .from('shop_settings')
        .select('minimum_order_value')
        .single()

      if (error) throw error
      
      setMinimumOrderValue(data?.minimum_order_value || 0)
      console.log('Shop settings loaded:', data)
    } catch (error) {
      console.error('Error fetching shop settings:', error)
      setMinimumOrderValue(0)
    }
  }

  const fetchDeliveryOptions = async () => {
    try {
      setIsLoadingOptions(true)
      setOptionsError(null)
      console.log('Fetching delivery options...')
      
      const response = await supabase.functions.invoke('get-available-delivery-options')
      
      if (response.error) {
        throw response.error
      }
      
      // Check if we have valid data
      if (response.data && Array.isArray(response.data)) {
        setDeliveryOptions(response.data)
        console.log('Delivery options loaded successfully:', response.data)
      } else {
        throw new Error('Invalid response format from delivery options API')
      }
    } catch (error) {
      console.error('Error fetching delivery options:', error)
      setOptionsError('Unable to load delivery options from server. Using defaults.')
      
      // Fallback options only when API fails
      const fallbackOptions = [
        { type: 'instant', label: 'Instant Delivery (30-45 min)', charge: 0 },
        { type: 'morning', label: 'Morning Delivery (Tomorrow 7 AM - 9 AM)', charge: 0 },
        { type: 'evening', label: 'Evening Delivery (Tomorrow 6 PM - 8 PM)', charge: 0 },
      ]
      setDeliveryOptions(fallbackOptions)
    } finally {
      setIsLoadingOptions(false)
    }
  }

  const calculateDeliveryCharge = async () => {
    if (!deliveryLat || !deliveryLng) return

    try {
      console.log('Calculating delivery charge...')
      const { data, error } = await supabase.functions.invoke('calculate-delivery-charge', {
        body: { p_customer_lat: deliveryLat, p_customer_lon: deliveryLng }
      })
      
      if (error) throw error
      
      setDeliveryCharge(data?.delivery_charge || 0)
      console.log('Delivery charge calculated:', data)
    } catch (error) {
      console.error('Error calculating delivery charge:', error)
      const fallbackCharge = 25
      setDeliveryCharge(fallbackCharge)
      console.log('Using fallback delivery charge:', fallbackCharge)
    }
  }

  const handlePlaceOrder = async () => {
    setIsPlacingOrder(true)

    try {
      // Validation
      if (!customerName.trim() || !customerPhone.trim()) {
        throw new Error("Please fill in your name and phone number.")
      }

      if (!selectedDeliveryOption) {
        throw new Error("Please choose a delivery option to continue.")
      }

      if (!deliveryLat || !deliveryLng || !deliveryLocationName) {
        throw new Error("Please select a delivery location.")
      }

      // Prepare cart data
      const p_cart = items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        price_at_purchase: parseFloat(item.price_string.replace(/[^\d.]/g, '')),
      }))

      let payload
      let response

      if (user) {
        // Authenticated user order
        payload = {
          p_delivery_lat: deliveryLat,
          p_delivery_lon: deliveryLng,
          p_delivery_location_name: deliveryLocationName,
          p_delivery_type: selectedDeliveryOption,
          p_cart: p_cart,
          p_customer_notes: customerNotes || null,
        }
        
        console.log('Placing order with payload:', payload)
        response = await supabase.functions.invoke("create-authenticated-order", {
          body: payload
        })
      } else {
        // Guest user order
        payload = {
          p_name: customerName,
          p_phone: customerPhone,
          p_delivery_lat: deliveryLat,
          p_delivery_lon: deliveryLng,
          p_delivery_location_name: deliveryLocationName,
          p_delivery_type: selectedDeliveryOption,
          p_cart: p_cart,
        }
        
        console.log('Placing order with payload:', payload)
        response = await supabase.functions.invoke("create-guest-order", {
          body: payload
        })
      }

      if (response.error) {
        throw new Error(response.error.message || "Order placement failed.")
      }

      if (!response.data?.order_id) {
        throw new Error("Order placement failed - no order ID returned.")
      }

      // Success: clear cart and navigate to success page
      console.log('Order placed successfully:', response.data)
      clearCart()
      navigate(`/order-confirmation/success/${response.data.order_id}`)

    } catch (error: any) {
      console.error('Order placement error:', error)
      
      // Navigate to failure page on any error
      navigate('/order-confirmation/failure')
      
      toast({
        title: "Order Failed",
        description: error.message || "Order placement failed. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsPlacingOrder(false)
    }
  }

  const subtotal = getSubtotal()
  const total = subtotal + deliveryCharge
  const isMinimumOrderMet = subtotal >= minimumOrderValue

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showSearch={false} />
      
      {/* Desktop-constrained container */}
      <div className="w-full max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20 md:pb-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
          </div>

          {/* Minimum order alert */}
          {!isMinimumOrderMet && minimumOrderValue > 0 && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Minimum order value is ₹{minimumOrderValue.toFixed(2)}. Add ₹{(minimumOrderValue - subtotal).toFixed(2)} more to proceed.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left Column - Forms */}
            <div className="space-y-6">
              {/* Customer Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Customer Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      placeholder="Enter your full name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      placeholder="Enter your phone number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Delivery Address */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MapPin className="w-5 h-5" />
                    <span>Delivery Address</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">{deliveryLocationName}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => navigate('/set-delivery-location')}
                  >
                    Change Address
                  </Button>
                </CardContent>
              </Card>

              {/* Delivery Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Clock className="w-5 h-5" />
                    <span>Delivery Options</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingOptions ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <>
                      {optionsError && (
                        <Alert className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{optionsError}</AlertDescription>
                        </Alert>
                      )}
                      <RadioGroup
                        value={selectedDeliveryOption}
                        onValueChange={setSelectedDeliveryOption}
                        className="space-y-3"
                      >
                        {deliveryOptions.map((option) => (
                          <div key={option.type} className="flex items-center space-x-2">
                            <RadioGroupItem value={option.type} id={option.type} />
                            <Label htmlFor={option.type} className="flex-1 cursor-pointer">
                              <div className="flex justify-between items-center">
                                <span>{option.label}</span>
                                {option.type === 'instant' && selectedDeliveryOption === 'instant' && deliveryCharge > 0 && (
                                  <span className="text-sm text-green-600 font-medium">
                                    +₹{deliveryCharge.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Order Notes */}
              <Card>
                <CardHeader>
                  <CardTitle>Special Instructions (Optional)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Any special delivery instructions..."
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    rows={3}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Order Summary */}
            <div className="space-y-6">
              {/* Order Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <ShoppingBag className="w-5 h-5" />
                    <span>Order Summary</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {items.map((item) => (
                    <div key={item.product_id} className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                            <span>📦</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">{item.name}</h4>
                        <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                      </div>
                      <div className="text-sm font-semibold">
                        ₹{(parseFloat(item.price_string.replace(/[^\d.]/g, '')) * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Bill Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Bill Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery Charge:</span>
                    <span>₹{deliveryCharge.toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total:</span>
                    <span className="text-green-600">₹{total.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Method */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CreditCard className="w-5 h-5" />
                    <span>Payment Method</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">Cash on Delivery</p>
                </CardContent>
              </Card>

              {/* Place Order Button */}
              <Button
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || !selectedDeliveryOption || !isMinimumOrderMet}
                className="w-full"
                style={{ backgroundColor: '#23b14d' }}
                size="lg"
              >
                {isPlacingOrder ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Placing Order...
                  </>
                ) : (
                  `Place Order - ₹${total.toFixed(2)}`
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CheckoutPage
