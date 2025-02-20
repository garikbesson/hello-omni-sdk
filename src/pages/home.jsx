import styles from '@/styles/app.module.css';
import NearLogo from '@/assets/near-logo.svg';
import NextLogo from '@/assets/react.svg';
import { Cards } from '@/components/cards';
import { useState } from 'react';

const Home = () => {
  const [selectedButton, setSelectedButton] = useState('deposit'); // Default to deposit
  const [depositNetwork, setDepositNetwork] = useState('near'); // Default deposit network
  const [withdrawNetwork, setWithdrawNetwork] = useState('solana'); // Default withdraw network

  const handleDepositClick = () => {
    setSelectedButton('deposit');
  };

  const handleWithdrawClick = () => {
    setSelectedButton('withdraw');
  };

  const handleDepositNetworkChange = (event) => {
    setDepositNetwork(event.target.value);
  };

  const handleWithdrawNetworkChange = (event) => {
    setWithdrawNetwork(event.target.value);
  };
  return (

    <main className={styles.main}>
    <div className={styles.description}> </div>

    <div className={styles.center}>
      <img className={styles.logo} src={NearLogo} alt="NEAR Logo" width={110 * 1.5} height={28 * 1.5} />
      <h3 className="ms-2 me-3 text-dark"> + </h3>
      <img
          className={styles.reactLogo}
          src={NextLogo}
          alt="React Logo"
          width={300 * 0.58}
          height={61 * 0.58}
        />
    </div>
    <div className={styles['swap-container']}>
      <div>
        <button
          onClick={handleDepositClick}
          className="btn"
          style={{ backgroundColor: selectedButton === 'deposit' ? 'lightblue' : 'white' }}
        >
          Deposit
        </button>
        <button
          onClick={handleWithdrawClick}
          className="btn"
          style={{ backgroundColor: selectedButton === 'withdraw' ? 'lightblue' : 'white' }}
        >
          Withdraw
        </button>
      </div>
      <div className='d-inline-flex'>
        <div>
          From:
          <select
            className="form-select"
            value={selectedButton === 'deposit' ? depositNetwork : 'hot-omni'}
            onChange={handleDepositNetworkChange}
            disabled={selectedButton === 'withdraw'}
          >
            {selectedButton === 'deposit' ? (
              <>
                <option value="ton">Ton</option>
                <option value="solana">Solana</option>
                <option value="near">Near</option>
              </>
            ) : (
              <option value="hot-omni">Hot Omni</option>
            )}
          </select>
        </div>
        <div>
          To:
          <select
            className="form-select"
            value={selectedButton === 'withdraw' ? withdrawNetwork : 'hot-omni'}
            onChange={handleWithdrawNetworkChange}
            disabled={selectedButton === 'deposit'}
          >
            {selectedButton === 'withdraw' ? (
              <>
                <option value="ton">Ton</option>
                <option value="solana">Solana</option>
                <option value="near">Near</option>
              </>
            ) : (
              <option value="hot-omni">Hot Omni</option>
            )}
          </select>
        </div>
      </div>
      <div>
        <button className="btn btn-success">Confirm</button>
      </div>
    </div>
    <div className={styles.grid}>
      <Cards />
    </div>
  </main>
  )
}

export default Home
