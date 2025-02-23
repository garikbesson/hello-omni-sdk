import { useContext, useEffect, useRef, useState } from 'react';
import { formatNearAmount } from "@near-js/utils";

import { NearContext } from '@/wallets/near';
import { Cards } from '@/components/cards';

import { getOmniBalances, getActiveWithdrawals, depositToken, withdrawToken } from '@/omni';
import { OmniHotContract, tokens } from '@/config';
import styles from '@/styles/app.module.css';

const Omni = () => {
  const { signedAccountId, wallet } = useContext(NearContext);
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState(true);
  const [selectedWithdraw, setSelectedWithdraw] = useState(false);
  const [fromSelector, setFromSelector] = useState("near");
  const [toSelector, setToSelector] = useState("hot-omni");
  const [tokenAmount, setTokenAmount] = useState(0.001);
  const [usdtBalance, setUsdtBalance] = useState(null);
  // const [activeWithdrawals, setActiveWithdrawals] = useState([]);
  // const [usdcBalance, setUsdcBalance] = useState(null);

  const tokenSelectorRef = useRef(null);
  const fromSelectorRef = useRef(null);
  const toSelectorRef = useRef(null);

  const handleDepositClick = () => {
    setSelectedDeposit(true);
    setSelectedWithdraw(false);
  };

  const handleWithdrawClick = () => {
    setSelectedDeposit(false);
    setSelectedWithdraw(true);
  };

  const handleFromSelectorChange = (event) => {
    setFromSelector(event.target.value);
  };

  const handleToSelectorChange = (event) => {
    setToSelector(event.target.value);
  };

  const handleTokenAmountChange = (event) => {
    setTokenAmount(event.target.value);
  };

  const handleConfirmClick = async () => {
    const tokenSelectorValue = tokenSelectorRef.current.value;
    const fromSelectorValue = fromSelectorRef.current.value;
    const toSelectorValue = toSelectorRef.current.value;
    
    if (selectedDeposit) {
      const tokenData = tokens[tokenSelectorValue][fromSelectorValue];
      depositToken(wallet, signedAccountId, tokenData.address, tokenAmount, tokenData.decimals);
    } else if (selectedWithdraw) {
      const tokenData = tokens[tokenSelectorValue][toSelectorValue];
      withdrawToken(wallet, signedAccountId, tokenData.address, tokenData.id, tokenAmount);
    }
  };

  useEffect(() => {
    setLoggedIn(!!signedAccountId);

    const updateOmniData = async () => {
      if (signedAccountId) {
        getActiveWithdrawals(wallet, signedAccountId);

        const balances = await getOmniBalances(wallet, signedAccountId);
        setUsdtBalance(balances[9]);        
      }
    };

    updateOmniData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedAccountId]);
  
  return (
    <main className={styles.main}>
      <div className={styles.description}>
        <p>
          Interacting with the contract: &nbsp;
          <code className={styles.code}>{OmniHotContract}</code>
        </p>
      </div>
      <div className={styles.center}>
        <div className="d-flex flex-row w-100 gap-5">
          <div className="d-flex flex-column w-100 gap-3">
            <div className="w-100">
              <input
                className="btn-check w-50"
                id="deposit-radio-btn"
                type="radio"
                autoComplete="off"
                checked={selectedDeposit}
                onChange={handleDepositClick}
              ></input>
              <label
                className="btn btn-outline-primary w-50"
                htmlFor="deposit-radio-btn"
              >Deposit</label>

              <input
                className="btn-check w-50"
                id="withdraw-radio-btn"
                type="radio"
                autoComplete="off"
                checked={selectedWithdraw}
                onChange={handleWithdrawClick}
              ></input>
              <label
                className="btn btn-outline-primary w-50"
                htmlFor="withdraw-radio-btn"
              >Withdraw</label>
            </div>

            {/* <div className="d-flex flex-row gap-1">
              <div className="d-flex flex-column w-100 gap-3"> */}
                Token
                <select
                  className="form-select w-100"
                  id="token-selector"
                  defaultValue="usdt"
                  ref={tokenSelectorRef}
                >
                    <option value="usdt">USDT</option> 
                    {/* <option value="usdc">USDC</option>  */}
                </select>
              {/* </div>
              <div className="d-flex flex-column w-100 gap-3"> */}
                Amount
                <input
                  type="number"
                  className="form-control w-100"
                  id="token-amount"
                  placeholder="Enter amount"
                  value={tokenAmount}
                  onChange={handleTokenAmountChange}
                />
              {/* </div>
              <div className="d-flex flex-column w-100 gap-3"> */}
                From
                <select
                  className="form-select w-100"
                  id="from-selector"
                  value={fromSelector}
                  disabled={selectedWithdraw}
                  onChange={handleFromSelectorChange}
                  ref={fromSelectorRef}
                >
                  {selectedDeposit ? (
                    <>
                      <option value="near">Near</option>
                      <option value="solana">Solana</option>
                      <option value="ton">Ton</option>
                    </>
                  ) : (
                    <option value="hot-omni">Hot Omni</option>
                  )}
                </select>
              {/* </div>
              <div className="d-flex flex-column w-100 gap-3"> */}
                To
                <select
                  className="form-select w-100"
                  id="to-selector"
                  value={toSelector}
                  disabled={selectedDeposit}
                  onChange={handleToSelectorChange}
                  ref={toSelectorRef}
                >
                  {selectedWithdraw ? (
                    <>
                      <option value="near">Near</option>
                      <option value="solana">Solana</option>
                      <option value="ton">Ton</option>
                    </>
                  ) : (
                    <option value="hot-omni">Hot Omni</option>
                  )}
                </select>
              {/* </div>
            </div> */}

            <div className="text-center">
              <button type="button" className="btn btn-success" onClick={handleConfirmClick}>Confirm</button>
            </div>
          </div>
          <div className="d-flex flex-column w-50 gap-3">
            <table className="table table-striped">
              <thead>
                <tr>
                  <th scope="col">Ticker</th>
                  <th scope="col">Omni Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">USDT</th>
                    <td>{usdtBalance ? formatNearAmount(usdtBalance, tokens.usdt.near.decimals) : '-'}</td>
                </tr>
                {/* <tr>
                  <th scope="row">USDC</th>
                    <td>{usdcBalance ? usdcBalance : '-'}</td>
                </tr> */}
              </tbody>
            </table>
          </div>
        </div>
        <div className="w-100 text-end align-text-center" hidden={loggedIn}>
          <p className="m-0"> Please login to change the greeting </p>
        </div>
      </div>
      <Cards />
    </main>
    // <div className={styles['swap-container']}>

    // </div>
  )
} 

export default Omni;