import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export default function PhoneVerification({ verificationToken, phoneToVerify = '', onAuthResult }) {
  const [phone, setPhone] = useState(phoneToVerify)
  const [code, setCode] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [hasSentCode, setHasSentCode] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const sendCode = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSending(true)
    try {
      const response = await fetch(`${API_URL}/auth/phone/send-otp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${verificationToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to send the verification code')
      setHasSentCode(true)
      setMessage(data.message)
    } catch (sendError) {
      setError(sendError.message)
    } finally {
      setIsSending(false)
    }
  }

  const verifyCode = async (event) => {
    event.preventDefault()
    setError('')
    setIsVerifying(true)
    try {
      const response = await fetch(`${API_URL}/auth/phone/verify-otp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${verificationToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to verify the phone number')
      onAuthResult(data)
    } catch (verifyError) {
      setError(verifyError.message)
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="auth-form">
      <p>Verify your phone number to continue. Use international format, for example +919876543210.</p>
      <form className="auth-form" onSubmit={sendCode}>
        <label htmlFor="verification-phone">Phone number</label>
        <input
          id="verification-phone"
          type="tel"
          autoComplete="tel"
          placeholder="+919876543210"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
        />
        <button className="form-submit" type="submit" disabled={isSending}>
          {isSending ? 'Sending…' : hasSentCode ? 'Resend code' : 'Send verification code'}
        </button>
      </form>
      {hasSentCode && (
        <form className="auth-form" onSubmit={verifyCode}>
          <label htmlFor="verification-code">SMS verification code</label>
          <input
            id="verification-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
          <button className="form-submit" type="submit" disabled={isVerifying}>
            {isVerifying ? 'Verifying…' : 'Verify phone'}
          </button>
        </form>
      )}
      {message && <p className="form-success">{message}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
