import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n/translations'

const previewLabels = {
  product_name: 'Product Name',
  barcode: 'Barcode',
  product_code: 'Product Code / SKU',
  category_name: 'Category',
  unit: 'Unit',
  wholesale_price: 'Wholesale Price',
  selling_price: 'Retail Price',
  stock_quantity: 'Stock Quantity',
  low_stock_limit: 'Default Low Stock Limit',
}

function ProductScannerModal({
  applying,
  canCreateCategory,
  createMissingCategory,
  error,
  onApply,
  onClose,
  onDetected,
  preview,
  processing,
  setCreateMissingCategory,
}) {
  const [manualCode, setManualCode] = useState('')
  const [cameraStatus, setCameraStatus] = useState('idle')
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const detectingRef = useRef(false)

  const stopCamera = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setCameraStatus('idle')
  }

  useEffect(() => {
    return () => {
      controlsRef.current?.stop()
    }
  }, [])

  const submitDetectedValue = async (value) => {
    const normalized = String(value || '').trim()
    if (!normalized || detectingRef.current) return

    detectingRef.current = true
    stopCamera()

    try {
      await onDetected(normalized)
      setManualCode(normalized)
    } finally {
      detectingRef.current = false
    }
  }

  const startCamera = async () => {
    setCameraError('')
    setCameraStatus('starting')

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error')
      setCameraError(t('Camera scanning is not supported on this device.'))
      return
    }

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
          },
        },
        videoRef.current,
        (result, _scanError, scannerControls) => {
          if (result) {
            scannerControls.stop()
            submitDetectedValue(result.getText())
          }
        },
      )

      controlsRef.current = controls
      setCameraStatus('active')
    } catch (cameraAccessError) {
      setCameraStatus('error')

      if (
        cameraAccessError?.name === 'NotAllowedError' ||
        cameraAccessError?.name === 'SecurityError'
      ) {
        setCameraError(t('Camera permission was denied. Allow camera access and try again.'))
      } else if (
        cameraAccessError?.name === 'NotFoundError' ||
        cameraAccessError?.name === 'DevicesNotFoundError'
      ) {
        setCameraError(t('No camera was found on this device.'))
      } else {
        setCameraError(t('Unable to start the camera scanner.'))
      }
    }
  }

  const submitManualCode = (event) => {
    event.preventDefault()
    submitDetectedValue(manualCode)
  }

  const closeModal = () => {
    stopCamera()
    detectingRef.current = false
    onClose()
  }

  const previewFields = preview
    ? Object.entries(preview.draft || {}).filter(([, value]) => value !== '')
    : []

  return (
    <div className="modal-backdrop scanner-backdrop" role="presentation">
      <section
        className="receipt-modal scanner-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-scanner-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('Products')}</p>
            <h2 id="product-scanner-title">{t('Product scanner')}</h2>
          </div>
          <button type="button" className="ghost-button" onClick={closeModal}>
            {t('Close')}
          </button>
        </div>

        <div className="scanner-layout">
          <section className="scanner-camera-panel">
            <div className="scanner-panel-heading">
              <strong>{t('Camera scanner')}</strong>
              <span className={`status ${cameraStatus === 'active' ? 'active' : 'pending'}`}>
                {cameraStatus === 'active' ? t('Active') : t('Camera is off')}
              </span>
            </div>
            <div className={`scanner-video-frame ${cameraStatus}`}>
              <video ref={videoRef} muted playsInline />
              {cameraStatus !== 'active' && (
                <div className="scanner-video-placeholder" aria-hidden="true">
                  <span>QR</span>
                </div>
              )}
              {cameraStatus === 'active' && <div className="scanner-target" aria-hidden="true" />}
            </div>
            <div className="scanner-camera-actions">
              {cameraStatus === 'active' ? (
                <button type="button" className="ghost-button" onClick={stopCamera}>
                  {t('Stop Camera')}
                </button>
              ) : (
                <button type="button" onClick={startCamera} disabled={cameraStatus === 'starting'}>
                  {cameraStatus === 'starting' ? t('Starting Camera...') : t('Start Camera')}
                </button>
              )}
            </div>
            {cameraError && <div className="alert">{cameraError}</div>}
          </section>

          <section className="scanner-manual-panel">
            <strong>{t('Manual code')}</strong>
            <form onSubmit={submitManualCode} className="scanner-manual-form">
              <input
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder={t('Scan or enter barcode / QR')}
                autoFocus
              />
              <button type="submit" disabled={processing || !manualCode.trim()}>
                {processing ? t('Checking...') : t('Check Code')}
              </button>
            </form>
          </section>
        </div>

        {(error || preview) && (
          <section className="scanner-preview">
            <div className="scanner-panel-heading">
              <strong>{t('Scan result preview')}</strong>
              {preview && (
                <span className={`status ${preview.existingProduct ? 'verified' : 'pending'}`}>
                  {preview.existingProduct
                    ? t('Existing product found')
                    : preview.isJson
                      ? t('JSON product data')
                      : t('New product code')}
                </span>
              )}
            </div>

            {error && <div className="alert">{error}</div>}

            {preview && (
              <>
                <div className="scanner-raw-value">
                  <span>{t('Raw value')}</span>
                  <code>{preview.raw}</code>
                </div>

                {preview.existingProduct && (
                  <div className="scanner-existing-product">
                    <strong>{preview.existingProduct.product_name}</strong>
                    <span>
                      {preview.existingProduct.product_code ||
                        preview.existingProduct.barcode ||
                        `#${preview.existingProduct.id}`}
                    </span>
                  </div>
                )}

                {previewFields.length > 0 && (
                  <dl className="scanner-preview-grid">
                    {previewFields.map(([field, value]) => (
                      <div key={field}>
                        <dt>{t(previewLabels[field] || field)}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {preview.missingCategory && (
                  <div className="scanner-category-warning">
                    <div>
                      <strong>{t('Category does not exist')}</strong>
                      <span>{preview.categoryName}</span>
                    </div>
                    {canCreateCategory ? (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={createMissingCategory}
                          onChange={(event) => setCreateMissingCategory(event.target.checked)}
                        />
                        {t('Create missing category')}
                      </label>
                    ) : (
                      <span className="muted">{t('The product will remain uncategorized.')}</span>
                    )}
                  </div>
                )}

                <div className="scanner-preview-actions">
                  <button type="button" className="ghost-button" onClick={closeModal}>
                    {t('Cancel')}
                  </button>
                  <button type="button" onClick={onApply} disabled={applying || processing}>
                    {applying ? t('Applying...') : t('Use Scanned Data')}
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </section>
    </div>
  )
}

export default ProductScannerModal
